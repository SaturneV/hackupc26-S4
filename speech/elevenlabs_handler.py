"""
ElevenLabs Audio Handler

A unified class for handling text-to-speech and speech-to-text operations
using the ElevenLabs API.
"""

import os
from typing import Optional, Union
from pathlib import Path
from elevenlabs.client import ElevenLabs


class ElevenLabsHandler:
    """
    A wrapper class for ElevenLabs API operations.
    
    Provides easy-to-use methods for:
    - Converting text to speech
    - Converting speech to text (transcription)
    
    Attributes:
        api_key (str): ElevenLabs API key
        client (ElevenLabs): ElevenLabs client instance
    """
    
    # Default voice IDs
    DEFAULT_VOICE_ID = "NOpBlnGInO9m6vDvFkFC"
    
    # Default model IDs
    TEXT_TO_SPEECH_MODEL = "eleven_v3"
    SPEECH_TO_TEXT_MODEL = "scribe_v2"
    
    # Supported languages
    SUPPORTED_LANGUAGES = {
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "it": "Italian",
        "pt": "Portuguese",
        "pl": "Polish",
        "ja": "Japanese",
        "zh": "Chinese",
    }
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the ElevenLabs handler.
        
        Args:
            api_key (str, optional): ElevenLabs API key. If not provided,
                                    will attempt to read from ELEVENLABS_API_KEY
                                    environment variable.
        
        Raises:
            ValueError: If no API key is provided and environment variable is not set.
        """
        if api_key is None:
            api_key = os.getenv("ELEVENLABS_API_KEY")
        
        if not api_key:
            raise ValueError(
                "API key not provided. Please pass api_key parameter or set "
                "ELEVENLABS_API_KEY environment variable."
            )
        
        self.api_key = api_key
        self.client = ElevenLabs(api_key=self.api_key)
    
    def text_to_speech(
        self,
        text: str,
        voice_id: str = DEFAULT_VOICE_ID,
        language_code: str = "en",
        model_id: str = TEXT_TO_SPEECH_MODEL,
        output_path: Optional[Union[str, Path]] = None,
    ) -> Union[bytes, str]:
        """
        Convert text to speech.
        
        Args:
            text (str): The text to convert to speech.
            voice_id (str, optional): The voice ID to use. Defaults to DEFAULT_VOICE_ID.
            language_code (str, optional): Language code (e.g., 'en', 'es'). Defaults to 'en'.
            model_id (str, optional): The model to use. Defaults to TEXT_TO_SPEECH_MODEL.
            output_path (str or Path, optional): If provided, saves audio to this file path
                                                and returns the path. Otherwise returns bytes.
        
        Returns:
            Union[bytes, str]: Audio bytes if output_path is None, otherwise the file path.
        
        Raises:
            ValueError: If text is empty.
            Exception: If the API call fails.
        
        Example:
            >>> handler = ElevenLabsHandler()
            >>> audio = handler.text_to_speech("Hello world")
            >>> # Or save to file
            >>> path = handler.text_to_speech("Hello world", output_path="output.mp3")
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty.")
        
        try:
            audio = self.client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id=model_id,
                language_code=language_code,
            )
            
            if output_path:
                output_path = Path(output_path)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(audio)
                return str(output_path)
            
            return audio
        
        except Exception as e:
            raise Exception(f"Text-to-speech conversion failed: {str(e)}")
    
    def speech_to_text(
        self,
        audio_file: Union[str, Path],
        model_id: str = SPEECH_TO_TEXT_MODEL,
        language_code: Optional[str] = None,
        diarize: bool = True,
        tag_audio_events: bool = True,
    ) -> dict:
        """
        Convert speech to text (transcribe audio).
        
        Args:
            audio_file (str or Path): Path to the audio file to transcribe.
            model_id (str, optional): The model to use. Defaults to SPEECH_TO_TEXT_MODEL.
            language_code (str, optional): Language code for transcription. If None, auto-detect.
            diarize (bool, optional): Enable speaker diarization. Defaults to True.
            tag_audio_events (bool, optional): Tag audio events. Defaults to True.
        
        Returns:
            dict: Transcription result containing:
                - text: The transcribed text
                - chunks: Detailed chunks with timings and speakers (if diarize=True)
                - Other metadata from the API response
        
        Raises:
            FileNotFoundError: If the audio file doesn't exist.
            ValueError: If the audio file path is invalid.
            Exception: If the API call fails.
        
        Example:
            >>> handler = ElevenLabsHandler()
            >>> result = handler.speech_to_text("audio.mp3")
            >>> print(result['text'])
        """
        audio_file = Path(audio_file)
        
        if not audio_file.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_file}")
        
        if not audio_file.is_file():
            raise ValueError(f"Path is not a file: {audio_file}")
        
        try:
            with open(audio_file, "rb") as f:
                transcription = self.client.speech_to_text.convert(
                    file=f,
                    model_id=model_id,
                    language_code=language_code,
                    diarize=diarize,
                    tag_audio_events=tag_audio_events,
                )
            
            return transcription
        
        except Exception as e:
            raise Exception(f"Speech-to-text conversion failed: {str(e)}")
    
    def supported_languages(self) -> dict:
        """
        Get a dictionary of supported language codes.
        
        Returns:
            dict: Dictionary with language codes as keys and language names as values.
        
        Example:
            >>> handler = ElevenLabsHandler()
            >>> langs = handler.supported_languages()
            >>> print(langs)
        """
        return self.SUPPORTED_LANGUAGES.copy()


# Example usage
if __name__ == "__main__":
    # Initialize the handler
    handler = ElevenLabsHandler()
    
    # Example: Text to speech
    print("Converting text to speech...")
    try:
        # Save to file
        output_file = handler.text_to_speech(
            text="Hello! This is a test message from ElevenLabs.",
            output_path="output_audio.mp3"
        )
        print(f"Audio saved to: {output_file}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Example: Speech to text
    print("\nTranscribing audio file...")
    try:
        result = handler.speech_to_text("audio.mp3")
        print(f"Transcription: {result}")
    except FileNotFoundError:
        print("Audio file not found. Please provide a valid audio file path.")
    except Exception as e:
        print(f"Error: {e}")

