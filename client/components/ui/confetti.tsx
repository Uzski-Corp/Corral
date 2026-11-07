"use client";

import type { ReactNode } from "react";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type {
  GlobalOptions as ConfettiGlobalOptions,
  CreateTypes as ConfettiInstance,
  Options as ConfettiOptions,
} from "canvas-confetti";
import confetti from "canvas-confetti";

export type ConfettiRef = {
  fire: (options?: ConfettiOptions) => Promise<void> | void;
};

type Props = React.ComponentPropsWithRef<"canvas"> & {
  options?: ConfettiOptions;
  globalOptions?: ConfettiGlobalOptions;
  manualstart?: boolean;
  children?: ReactNode;
};

const ConfettiComponent = forwardRef<ConfettiRef, Props>((props, ref) => {
  const {
    options,
    globalOptions = { resize: true, useWorker: false },
    manualstart = false,
    children,
    className,
    ...rest
  } = props;

  const canvasNodeRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<ConfettiInstance | null>(null);
  const optionsRef = useRef(options);
  const globalOptionsRef = useRef(globalOptions);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    globalOptionsRef.current = globalOptions;
  }, [globalOptions]);

  useEffect(() => {
    const canvas = canvasNodeRef.current;
    if (!canvas || !canvas.getContext("2d") || instanceRef.current) return;
    instanceRef.current = confetti.create(canvas, {
      resize: true,
      useWorker: false,
      ...globalOptionsRef.current,
    });

    return () => {
      try {
        instanceRef.current?.reset();
      } catch {
        /* jsdom has no canvas bitmap */
      }
      instanceRef.current = null;
    };
  }, []);

  const fire = useCallback(async (opts: ConfettiOptions = {}) => {
    try {
      await instanceRef.current?.({
        ...optionsRef.current,
        ...opts,
      });
    } catch {
      /* The celebration is optional. A missing canvas should not block Continue. */
    }
  }, []);

  const api = useMemo<ConfettiRef>(() => ({ fire }), [fire]);

  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    if (!manualstart) {
      void fire();
    }
  }, [manualstart, fire]);

  return (
    <>
      <canvas ref={canvasNodeRef} className={className} {...rest} />
      {children}
    </>
  );
});

ConfettiComponent.displayName = "Confetti";

export const Confetti = ConfettiComponent;
