const MODEL_URL = '/models';
const DEMO_EMBEDDING = Array.from({ length: 128 }, (_, index) =>
  Number((((index % 11) - 5) / 10).toFixed(3)),
);

let faceapiPromise;
let modelsPromise;

async function getFaceApi() {
  if (!faceapiPromise) {
    faceapiPromise = import('face-api.js');
  }

  return faceapiPromise;
}

export function isDemoQueryEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get('demo') === 'true';
}

export async function ensureFaceModelsLoaded() {
  const faceapi = await getFaceApi();

  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  }

  await modelsPromise;
}

export async function extractFaceEmbedding(video) {
  const faceapi = await getFaceApi();
  await ensureFaceModelsLoaded();

  const result = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) {
    throw new Error('No face detected. Please center your face in the camera.');
  }

  return Array.from(result.descriptor, (value) => Number(value.toFixed(6)));
}

export function getDemoEmbedding() {
  return DEMO_EMBEDDING;
}

export async function captureHiddenFaceEmbedding() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera access.');
  }

  const video = document.createElement('video');
  const stream = await requestCameraStream();

  video.setAttribute('autoplay', 'true');
  video.setAttribute('muted', 'true');
  video.setAttribute('playsinline', 'true');
  video.style.position = 'fixed';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  video.style.left = '-9999px';
  video.style.top = '0';
  video.srcObject = stream;
  document.body.appendChild(video);

  try {
    const playPromise = video.play();
    if (playPromise?.catch) {
      await playPromise;
    }

    await waitForVideoFrame(video);
    return await extractFaceEmbedding(video);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    video.remove();
  }
}

async function requestCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
  } catch (cameraError) {
    throw new Error(getCameraErrorMessage(cameraError));
  }
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
      reject(new Error('The camera started, but no video frame was available yet. Try again.'));
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
