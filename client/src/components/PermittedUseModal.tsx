import React, { useEffect } from 'react';
import { X, ShieldCheck } from 'lucide-react';

interface PermittedUseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermittedUseModal: React.FC<PermittedUseModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={24} color="var(--accent-primary)" />
            <h3 id="modal-title" style={{ fontSize: '18px' }}>
              Permitted Use, Legal Boundaries & Safety
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-content">
          <div>
            <h4>1. User Authorization & Ownership</h4>
            <p>
              MediaFlow is strictly engineered to download publicly accessible media streams that you own, 
              or have explicit rights, license, or authorization to download. Permitted sources include:
            </p>
            <ul>
              <li>Creative Commons and open-source educational media (e.g. Wikimedia Commons).</li>
              <li>Public Domain cultural artifacts and open archives (e.g. Internet Archive).</li>
              <li>Directly hosted public videos, open podcasts, and self-hosted CDN content.</li>
            </ul>
          </div>

          <div>
            <h4>2. Strict Legal & Safety Guardrails</h4>
            <p>
              To maintain the highest security and ethical standards, MediaFlow implements firm technical boundaries:
            </p>
            <ul>
              <li><strong>No DRM Circumvention:</strong> The application does not decrypt encrypted streams or evade digital rights management.</li>
              <li><strong>No Authentication Bypassing:</strong> Does not scrape private profiles, bypass paywalls, or circumvent login sessions.</li>
              <li><strong>No Bot Evasion:</strong> Does not evade platform rate limits, CAPTCHAs, or token protections.</li>
              <li><strong>No Credential Storage:</strong> Does not request, process, or store your social-media accounts or passwords.</li>
            </ul>
          </div>

          <div>
            <h4>3. Platform Policy Compliance Gates</h4>
            <p>
              Platforms like YouTube, TikTok, Instagram, and X (Twitter) maintain strict Terms of Service that restrict 
              unauthorized automated media downloading without their official proprietary client or explicit API licenses.
            </p>
            <p style={{ marginTop: '6px' }}>
              When a link from a restricted platform is inspected, MediaFlow complies with platform terms and displays 
              the public title/thumbnail via official oEmbed endpoints where permitted, while providing clear educational 
              guidance rather than attempting unauthorized circumvention.
            </p>
          </div>

          <div>
            <h4>4. Security & Architecture</h4>
            <p>
              Every request undergoes rigorous multi-layer security validation:
            </p>
            <ul>
              <li><strong>SSRF Guard:</strong> Prevents unauthorized network requests to local, private, or loopback IPs (e.g. 127.0.0.1, 169.254.169.254).</li>
              <li><strong>Path Traversal Defense:</strong> Strips invalid characters and prevents writing outside the configured download directory.</li>
              <li><strong>Streaming Pipeline:</strong> Media is streamed directly into temporary <code>.part</code> files and atomically renamed upon 100% completion.</li>
            </ul>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            I Understand & Agree
          </button>
        </div>
      </div>
    </div>
  );
};
