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

  async function startCamera() {
    setStatus('requesting');
    setError('');

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('This browser does not support camera access.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
    } catch (cameraError) {
      setStatus('error');
      setError(getCameraErrorMessage(cameraError));
      return;
    }

    streamRef.current = stream;

    if (videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch((playError) => {
          console.warn('Unable to autoplay webcam preview:', playError);
        });
      }

      try {
        await waitForVideoFrame(video);
      } catch (videoError) {
        setStatus('error');
        setError('The camera started, but no video frame was available yet. Try again.');
        return;
      }
    }

    setStatus('ready');
  }

  useEffect(() => {
    startCamera();

    return () => {
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
        <video ref={videoRef} autoPlay muted playsInline className="camera-video" />
        {status === 'requesting' ? <div className="camera-overlay">Starting camera...</div> : null}
        {status === 'capturing' ? <div className="camera-overlay">Verifying...</div> : null}
      </div>
      {error ? <p className="status-error">{error}</p> : null}
      <div className="camera-actions">
        <button
          type="button"
          className="primary-button"
          onClick={handleCapture}
          disabled={status === 'requesting' || status === 'capturing' || status === 'error'}
        >
          {status === 'capturing' ? busyLabel : actionLabel}
        </button>
        {status === 'error' ? (
          <button
            type="button"
            className="ghost-button"
            onClick={startCamera}
            disabled={status === 'requesting'}
          >
            Retry camera
          </button>
        ) : null}
      </div>
    </section>
  );
}

function getCameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera access was blocked. Allow camera access in the browser and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is busy or unavailable. Close other apps using the camera and try again.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'The selected camera settings were not supported. Try again.';
    default:
      return 'Unable to start the camera. Check browser permissions and try again.';
  }
}

function waitForVideoFrame(video) {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('video_not_ready'));
    }, 5000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('canplay', handleReady);
    }

    function handleReady() {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    }

    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('canplay', handleReady);
  });
}
