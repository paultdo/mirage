import { useEffect, useRef, useState } from 'react';

export default function Webcam({
  title,
  description,
  actionLabel,
  busyLabel,
  onCapture,
  autoCapture = false,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const hasAutoCapturedRef = useRef(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      setStatus('requesting');
      setError('');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatus('ready');
      } catch (cameraError) {
        setStatus('error');
        setError('Camera access is required to continue. Check browser permissions and try again.');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  async function handleCapture() {
    if (!videoRef.current || status === 'capturing') {
      return;
    }

    setStatus('capturing');
    setError('');

    try {
      await onCapture(videoRef.current);
      setStatus('ready');
    } catch (captureError) {
      setStatus('ready');
      setError(captureError.message || 'Unable to capture a face right now.');
    }
  }

  useEffect(() => {
    if (autoCapture && status === 'ready' && !hasAutoCapturedRef.current) {
      hasAutoCapturedRef.current = true;
      handleCapture();
    }
  }, [autoCapture, status]);

  return (
    <section className="camera-panel">
      <div className="camera-copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="camera-frame">
        <video ref={videoRef} muted playsInline className="camera-video" />
        {status === 'requesting' ? <div className="camera-overlay">Starting camera...</div> : null}
        {status === 'capturing' ? <div className="camera-overlay">Verifying...</div> : null}
      </div>
      {error ? <p className="status-error">{error}</p> : null}
      <button
        type="button"
        className="primary-button"
        onClick={handleCapture}
        disabled={status === 'requesting' || status === 'capturing'}
      >
        {status === 'capturing' ? busyLabel : actionLabel}
      </button>
    </section>
  );
}
