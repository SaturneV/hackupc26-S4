import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, useTexture, Billboard } from '@react-three/drei';
import gsap from 'gsap';

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Position
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;

    // Model normal
    vec3 modelNormal = (modelMatrix * vec4(normal, 0.0)).xyz;

    // Varyings
    vUv = uv;
    vNormal = modelNormal;
    vPosition = modelPosition.xyz;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uTransition;

  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform sampler2D uSpecularCloudTexture;
  uniform vec3 uSunDirection;
  uniform vec3 uAtmosphereDayColor;
  uniform vec3 uAtmosphereTwilightColor;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  // Simple 3D noise function for the dissolve effect
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    // Holographic Base (Much darker and subtle for a premium feel)
    vec3 holoColor = vec3(0.01, 0.02, 0.03); // Deep space blue/black
    
    // Grid lines for holographic effect (finer and dimmer)
    float grid1 = abs(fract(vUv.x * 50.0) - 0.5) * 2.0;
    float grid2 = abs(fract(vUv.y * 25.0) - 0.5) * 2.0;
    float line = (1.0 - smoothstep(0.0, 0.05, grid1)) + (1.0 - smoothstep(0.0, 0.05, grid2));
    holoColor += vec3(0.2, 0.5, 0.8) * clamp(line, 0.0, 1.0) * 0.15; // Reduced intensity

    // Photorealistic Earth Calculation
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);
    vec3 realisticEarthColor = vec3(0.0);

    // Sun orientation
    float sunOrientation = dot(normal, uSunDirection);

    // Day / Night color
    float dayMix = smoothstep(-0.25, 0.5, sunOrientation);
    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;
    realisticEarthColor = mix(nightColor, dayColor, dayMix);

    // Specular clouds
    vec2 specularCloudsColor = texture2D(uSpecularCloudTexture, vUv).rg;

    // Clouds
    float cloudsMix = smoothstep(0.3, 1.0, specularCloudsColor.g);
    cloudsMix *= dayMix;
    realisticEarthColor = mix(realisticEarthColor, vec3(1.0), cloudsMix);

    // Fresnel
    float fresnel = pow(dot(viewDirection, normal) + 1.0, 3.0);

    // Atmosphere
    float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereDayMix);
    realisticEarthColor = mix(realisticEarthColor, atmosphereColor, fresnel * atmosphereDayMix);

    // Specular
    vec3 reflection = reflect(-uSunDirection, normal);
    float specular = -dot(reflection, viewDirection);
    specular = max(0.0, specular);
    specular = pow(specular, 50.0);

    vec3 specularColor = mix(vec3(1.0), atmosphereColor, fresnel);
    realisticEarthColor += specular * specularColor * specularCloudsColor.r;

    // Noise for transition
    float noise = snoise(vPosition * 3.0 + uTime * 0.2); // -1.0 to 1.0
    // Normalize noise to 0.0 -> 1.0
    noise = (noise + 1.0) * 0.5;

    // Threshold for transition (creating a burning/dissolve edge)
    float edgeWidth = 0.1;
    // We want uTransition to go from 0 (Holo) to 1 (Earth)
    float threshold = uTransition * (1.0 + edgeWidth * 2.0) - edgeWidth;
    
    float mixVal = smoothstep(threshold - edgeWidth, threshold + edgeWidth, noise);

    // Final color mixing
    vec3 finalColor = mix(realisticEarthColor, holoColor, mixVal);

    // Add a bright edge where the transition is happening
    float edge = smoothstep(threshold - edgeWidth, threshold, noise) * smoothstep(threshold + edgeWidth, threshold, noise);
    finalColor += vec3(0.4, 0.8, 1.0) * edge * 2.0; // Cyan glowing edge

    gl_FragColor = vec4(finalColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Position
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;

    // Model normal
    vec3 modelNormal = (modelMatrix * vec4(normal, 0.0)).xyz;

    // Varyings
    vNormal = modelNormal;
    vPosition = modelPosition.xyz;
  }
`;

const atmosphereFragmentShader = `
  uniform vec3 uSunDirection;
  uniform vec3 uAtmosphereDayColor;
  uniform vec3 uAtmosphereTwilightColor;
  uniform float uTransition;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);
    vec3 color = vec3(0.0);

    // Sun orientation
    float sunOrientation = dot(normal, uSunDirection);

    // Atmosphere
    float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereDayMix);
    color += atmosphereColor;

    // Alpha
    float edgeAlpha = dot(viewDirection, normal);
    edgeAlpha = smoothstep(0.0, 0.5, edgeAlpha);

    float dayAlpha = smoothstep(-0.5, 0.0, sunOrientation);
    float alpha = edgeAlpha * dayAlpha;

    // Fade out atmosphere in holographic mode
    alpha *= uTransition;

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function Globe({ destinations }) {
  const earthMaterialRef = useRef();
  const atmosphereMaterialRef = useRef();
  const globeRef = useRef();
  
  // Load local textures
  const [dayTex, nightTex, cloudsTex] = useTexture([
    '/earth/day.jpg',
    '/earth/night.jpg',
    '/earth/specularClouds.jpg'
  ]);

  const sunDirection = useMemo(() => {
    return new THREE.Vector3().setFromSpherical(new THREE.Spherical(0.93, Math.PI * 0.5, 0.5));
  }, []);

  const earthUniforms = useMemo(() => {
    dayTex.colorSpace = THREE.SRGBColorSpace;
    dayTex.anisotropy = 8;
    nightTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.anisotropy = 8;
    cloudsTex.anisotropy = 8;

    return {
      uTime: { value: 0 },
      uTransition: { value: 0 },
      uDayTexture: { value: dayTex },
      uNightTexture: { value: nightTex },
      uSpecularCloudTexture: { value: cloudsTex },
      uSunDirection: { value: sunDirection },
      uAtmosphereDayColor: { value: new THREE.Color('#00aaff') },
      uAtmosphereTwilightColor: { value: new THREE.Color('#066b9d') }
    };
  }, [dayTex, nightTex, cloudsTex, sunDirection]);

  const atmosphereUniforms = useMemo(() => {
    return {
      uSunDirection: { value: sunDirection },
      uAtmosphereDayColor: { value: new THREE.Color('#00aaff') },
      uAtmosphereTwilightColor: { value: new THREE.Color('#066b9d') },
      uTransition: { value: 0 }
    };
  }, [sunDirection]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (earthMaterialRef.current) {
      earthMaterialRef.current.uniforms.uTime.value = time;
    }
    if (globeRef.current) {
      // Rotating the entire group makes the markers rotate with the earth seamlessly
      globeRef.current.rotation.y = time * 0.05;
    }
  });

  // Trigger transition when destinations arrive
  useEffect(() => {
    if (destinations.length > 0) {
      if (earthMaterialRef.current) {
        gsap.to(earthMaterialRef.current.uniforms.uTransition, { value: 1, duration: 3, ease: "power2.inOut" });
      }
      if (atmosphereMaterialRef.current) {
        gsap.to(atmosphereMaterialRef.current.uniforms.uTransition, { value: 1, duration: 3, ease: "power2.inOut" });
      }
    } else {
      if (earthMaterialRef.current) {
        gsap.to(earthMaterialRef.current.uniforms.uTransition, { value: 0, duration: 2, ease: "power2.inOut" });
      }
      if (atmosphereMaterialRef.current) {
        gsap.to(atmosphereMaterialRef.current.uniforms.uTransition, { value: 0, duration: 2, ease: "power2.inOut" });
      }
    }
  }, [destinations]);

  // Convert Lat/Lng to Vector3 on a sphere
  const getPosition = (lat, lng, radius = 3) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  };

  return (
    <group ref={globeRef}>
      {/* Main Earth Mesh */}
      <mesh>
        <sphereGeometry args={[3, 64, 64]} />
        <shaderMaterial 
          ref={earthMaterialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={earthUniforms}
        />
      </mesh>

      {/* Atmosphere Mesh */}
      <mesh scale={[1.04, 1.04, 1.04]}>
        <sphereGeometry args={[3, 64, 64]} />
        <shaderMaterial 
          ref={atmosphereMaterialRef}
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={atmosphereUniforms}
          side={THREE.BackSide}
          transparent={true}
        />
      </mesh>

      {/* Markers for Destinations */}
      {destinations.map((dest, i) => {
        const lat = dest.coords ? dest.coords[0] : 0;
        const lng = dest.coords ? dest.coords[1] : 0;
        const pos = getPosition(lat, lng, 3.05);
        return (
          <Billboard key={dest.id || i} position={pos} follow={true}>
            <mesh>
              <sphereGeometry args={[0.05, 16, 16]} />
              <meshBasicMaterial color="#38BDF8" />
            </mesh>
            <mesh>
              <ringGeometry args={[0.06, 0.1, 32]} />
              <meshBasicMaterial color="#38BDF8" transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>

            <Html distanceFactor={15} center>
              {/* Optional: Add small HTML labels directly on the points if desired, 
                  but we'll keep it minimal since we have the cards below */}
            </Html>
          </Billboard>
        );
      })}
    </group>
  );
}
