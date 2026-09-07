import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import { gsap } from 'gsap';

/**
 * GSAP-powered smooth screen/tab transition hook.
 * Triggers a silky fade-and-slide transition whenever activeKey changes.
 */
export function useGsapTabTransition(activeKey: string, distance: number = 10, duration: number = 0.24) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Reset initial values
    opacity.setValue(0);
    translateY.setValue(distance);

    const proxy = { opacity: 0, y: distance };
    const tween = gsap.to(proxy, {
      opacity: 1,
      y: 0,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        opacity.setValue(proxy.opacity);
        translateY.setValue(proxy.y);
      },
    });

    return () => {
      tween.kill();
    };
  }, [activeKey, distance, duration, opacity, translateY]);

  return {
    opacity,
    translateY,
    animatedStyle: {
      flex: 1,
      opacity,
      transform: [{ translateY }],
    },
  };
}

/**
 * GSAP-powered smooth pulse hook for loading skeleton and breathing indicators.
 * Uses GSAP's smooth sine.inOut easing for natural, non-jarring loading effects.
 */
export function useGsapPulse(active: boolean = true, minVal: number = 0.25, maxVal: number = 0.75, duration: number = 0.75) {
  const animatedValue = useRef(new Animated.Value(minVal)).current;

  useEffect(() => {
    if (!active) {
      animatedValue.setValue(minVal);
      return;
    }

    const proxy = { val: minVal };
    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    tl.to(proxy, {
      val: maxVal,
      duration,
      ease: 'sine.inOut',
      onUpdate: () => {
        animatedValue.setValue(proxy.val);
      },
    });

    return () => {
      tl.kill();
    };
  }, [active, minVal, maxVal, duration, animatedValue]);

  return animatedValue;
}

/**
 * GSAP-powered loading indicator controller for smooth entrance, breathing, and exit.
 */
export function useGsapLoadingIndicator(isLoading: boolean) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(-24)).current;
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const fadeProxy = { opacity: (fadeAnim as any)._value || 0 };
    const translateProxy = { y: (translateYAnim as any)._value || -24 };
    const pulseProxy = { val: 0.35 };

    let pulseTl: gsap.core.Timeline | null = null;
    let enterTl: gsap.core.Timeline | null = null;
    let exitTl: gsap.core.Timeline | null = null;

    if (isLoading) {
      // 1. Smooth entrance animation with GSAP back.out easing
      enterTl = gsap.timeline();
      enterTl.to(fadeProxy, {
        opacity: 1,
        duration: 0.22,
        ease: 'power2.out',
        onUpdate: () => fadeAnim.setValue(fadeProxy.opacity),
      }, 0);
      enterTl.to(translateProxy, {
        y: 0,
        duration: 0.28,
        ease: 'back.out(1.4)',
        onUpdate: () => translateYAnim.setValue(translateProxy.y),
      }, 0);

      // 2. Breathing pulse glow animation
      pulseTl = gsap.timeline({ repeat: -1, yoyo: true });
      pulseTl.to(pulseProxy, {
        val: 1,
        duration: 0.65,
        ease: 'sine.inOut',
        onUpdate: () => pulseAnim.setValue(pulseProxy.val),
      });

      return () => {
        enterTl?.kill();
        pulseTl?.kill();
      };
    } else {
      // Smooth exit
      exitTl = gsap.timeline();
      exitTl.to(fadeProxy, {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
        onUpdate: () => fadeAnim.setValue(fadeProxy.opacity),
      }, 0);
      exitTl.to(translateProxy, {
        y: -24,
        duration: 0.2,
        ease: 'power2.in',
        onUpdate: () => translateYAnim.setValue(translateProxy.y),
      }, 0);

      return () => {
        exitTl?.kill();
      };
    }
  }, [isLoading, fadeAnim, translateYAnim, pulseAnim]);

  return {
    fadeAnim,
    translateYAnim,
    pulseAnim,
  };
}
