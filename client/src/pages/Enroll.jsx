import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from '../components/Webcam';
import { enrollFace, verifyFace } from '../lib/api';
import { extractFaceEmbedding, getDemoEmbedding, isDemoQueryEnabled } from '../lib/face';

export default function EnrollPage({ app }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const demoQueryEnabled = isDemoQueryEnabled();

  async function handleEnroll(videoElement) {
    const embedding = demoQueryEnabled ? getDemoEmbedding() : await extractFaceEmbedding(videoElement);
    await enrollFace({ embedding });
    await verifyFace({ embedding });
    await app.refreshMe();
    setMessage('Face enrolled. Redirecting to files...');
    navigate('/files', { replace: true });
  }

  return (
    <div className="editorial-shell">
      <div className="editorial-vignette" aria-hidden="true" />
      <main className="editorial-capture-card">
        <header className="editorial-header">
          <h1 className="editorial-wordmark">Mirage</h1>
          <p className="editorial-eyebrow">Face enrollment</p>
        </header>

        <Webcam
          description="Center your face in frame and capture in steady lighting. This happens once."
          actionLabel="Capture face"
          busyLabel="Saving..."
          onCapture={handleEnroll}
        />

        {message ? <p className="editorial-status-success">{message}</p> : null}

        <p className="editorial-badge">
          <svg
            className="editorial-badge-icon"
            viewBox="0 0 14 14"
            aria-hidden="true"
          >
            <path
              d="M7 1 L12 3 V7 C12 9.5 10 11.5 7 13 C4 11.5 2 9.5 2 7 V3 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
          </svg>
          Stored on-device · One-time enrollment
        </p>
      </main>
    </div>
  );
}
