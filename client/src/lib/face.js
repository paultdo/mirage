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
