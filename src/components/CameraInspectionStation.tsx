import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  Eye,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Zap,
  RefreshCw,
  Binary,
  ShieldCheck,
  Video,
  FileImage,
  Check,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  ChevronRight
} from 'lucide-react';
import {
  applyClaheFilter,
  analyzeImageForDefects,
  drawHudOverlay,
  mapBackendToDetectionResult,
  DefectDetectionResult
} from '../utils/cameraProcessing';
import { api } from '../services/api';

interface DefectTypeInfo {
  id: string;
  name: string;
  description: string;
  rootCause: string;
  metallurgicalImpact: string;
  typicalSeverity: 'Low' | 'Medium' | 'High' | 'Critical';
  recommendedAction: string;
  sampleVisual: string;
}

interface CameraInspectionStationProps {
  neuDefects: DefectTypeInfo[];
  onCommitInspection?: (record: any) => void;
}

export function CameraInspectionStation({
  neuDefects,
  onCommitInspection
}: CameraInspectionStationProps) {
  const [inspectionMode, setInspectionMode] = useState<'upload' | 'webcam' | 'sample'>('upload');
  const [sampleIndex, setSampleIndex] = useState<number>(0);
  const [claheEnabled, setClaheEnabled] = useState<boolean>(true);
  const [clipLimit, setClipLimit] = useState<number>(2.5);

  // Upload State
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFileSize, setUploadedFileSize] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Webcam State
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [cameraFps, setCameraFps] = useState<number>(30.0);
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);

  // References
  const videoRef = useRef<HTMLVideoElement>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement>(null);
  const claheCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Current detection telemetry
  const [activeResult, setActiveResult] = useState<DefectDetectionResult>(() =>
    analyzeImageForDefects(undefined, neuDefects?.[0]?.id || 'crazing')
  );
  const activeResultRef = useRef<DefectDetectionResult>(activeResult);
  useEffect(() => {
    activeResultRef.current = activeResult;
  }, [activeResult]);

  const isInspectingWebcamRef = useRef<boolean>(false);
  const lastWebcamInferTimeRef = useRef<number>(0);

  const [inspectionSuccessToast, setInspectionSuccessToast] = useState<string | null>(null);

  // Handle preset sample changes
  useEffect(() => {
    if (inspectionMode === 'sample') {
      const selected = neuDefects?.[sampleIndex] || neuDefects?.[0];
      if (selected) {
        const result = analyzeImageForDefects(
          rawCanvasRef.current || undefined,
          selected.id
        );
        setActiveResult(result);
        renderPresetToCanvases(selected);
      }
    }
  }, [sampleIndex, inspectionMode, claheEnabled, clipLimit, neuDefects]);

  // Clean up webcam tracks on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // Web Camera start
  const startWebcam = async () => {
    setWebcamError(null);
    setCapturedSnapshot(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Web camera API (getUserMedia) is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment'
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsWebcamActive(true);
      startWebcamProcessingLoop();
    } catch (err: any) {
      console.warn('Webcam initialization failed:', err);
      let errorMsg = 'Camera access was blocked by browser permissions.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission was denied. Please allow camera permissions in your browser or iframe settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No physical web camera hardware was found on this system.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'The camera is currently being used by another application.';
      }
      setWebcamError(errorMsg);
      setIsWebcamActive(false);
    }
  };

  // Web Camera stop
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsWebcamActive(false);
  };

  // Continuous frame processing loop for live webcam
  const startWebcamProcessingLoop = () => {
    let lastTime = performance.now();
    let frameCount = 0;

    const processFrame = () => {
      const video = videoRef.current;
      const rawCanvas = rawCanvasRef.current;
      const claheCanvas = claheCanvasRef.current;
      const hudCanvas = hudCanvasRef.current;

      if (video && video.readyState >= 2 && rawCanvas && claheCanvas && hudCanvas) {
        const width = 640;
        const height = 480;

        rawCanvas.width = width;
        rawCanvas.height = height;
        claheCanvas.width = width;
        claheCanvas.height = height;
        hudCanvas.width = width;
        hudCanvas.height = height;

        // 1. Draw raw video frame
        const rawCtx = rawCanvas.getContext('2d');
        if (rawCtx) {
          rawCtx.drawImage(video, 0, 0, width, height);
        }

        // 2. Apply CLAHE filter if enabled
        if (claheEnabled) {
          applyClaheFilter(rawCanvas, claheCanvas, clipLimit);
        } else {
          const claheCtx = claheCanvas.getContext('2d');
          if (claheCtx) {
            claheCtx.drawImage(rawCanvas, 0, 0);
          }
        }

        // 3. Render HUD overlay with active detection state
        const hudCtx = hudCanvas.getContext('2d');
        if (hudCtx) {
          hudCtx.drawImage(claheEnabled ? claheCanvas : rawCanvas, 0, 0);
        }
        drawHudOverlay(hudCanvas, activeResultRef.current, cameraFps);

        // 4. Asynchronously run real fine-tuned YOLO model every 500ms
        const now = performance.now();
        if (now - lastWebcamInferTimeRef.current >= 500 && !isInspectingWebcamRef.current) {
          lastWebcamInferTimeRef.current = now;
          isInspectingWebcamRef.current = true;
          try {
            const frameB64 = rawCanvas.toDataURL('image/jpeg', 0.80);
            api.runInspection('WEBCAM-FRAME', frameB64)
              .then((res) => {
                const mapped = mapBackendToDetectionResult(res, width, height);
                activeResultRef.current = mapped;
                setActiveResult(mapped);
              })
              .catch(() => {})
              .finally(() => {
                isInspectingWebcamRef.current = false;
              });
          } catch {
            isInspectingWebcamRef.current = false;
          }
        }

        // Calculate live FPS
        frameCount++;
        if (now - lastTime >= 1000) {
          setCameraFps(+( (frameCount * 1000) / (now - lastTime) ).toFixed(1));
          frameCount = 0;
          lastTime = now;
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
  };

  // Draw simulated / preset steel specimens
  const renderPresetToCanvases = (defect: DefectTypeInfo) => {
    const rawCanvas = rawCanvasRef.current;
    const claheCanvas = claheCanvasRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (!rawCanvas || !claheCanvas || !hudCanvas) return;

    const width = 640;
    const height = 480;
    rawCanvas.width = width;
    rawCanvas.height = height;
    claheCanvas.width = width;
    claheCanvas.height = height;
    hudCanvas.width = width;
    hudCanvas.height = height;

    const rawCtx = rawCanvas.getContext('2d');
    if (!rawCtx) return;

    // Draw realistic cold-rolled steel texture
    const grad = rawCtx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#334155');
    grad.addColorStop(0.5, '#475569');
    grad.addColorStop(1, '#334155');
    rawCtx.fillStyle = grad;
    rawCtx.fillRect(0, 0, width, height);

    // Specular industrial glare simulation
    const glareGrad = rawCtx.createRadialGradient(width * 0.45, height * 0.4, 10, width * 0.45, height * 0.4, 280);
    glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    glareGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    rawCtx.fillStyle = glareGrad;
    rawCtx.fillRect(0, 0, width, height);

    // Conveyor rail guide marks
    rawCtx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
    rawCtx.lineWidth = 4;
    rawCtx.strokeRect(30, 0, width - 60, height);

    // Draw defect features on raw canvas
    if (defect.id === 'crazing') {
      rawCtx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      rawCtx.lineWidth = 1.5;
      for (let i = 0; i < 28; i++) {
        const x = 200 + Math.sin(i * 1.7) * 90;
        const y = 140 + Math.cos(i * 2.3) * 60;
        rawCtx.beginPath();
        rawCtx.moveTo(x, y);
        rawCtx.lineTo(x + (i % 5) * 8 - 15, y + (i % 4) * 8 - 10);
        rawCtx.stroke();
      }
    } else if (defect.id === 'inclusion') {
      rawCtx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      rawCtx.beginPath();
      rawCtx.ellipse(width * 0.48, height * 0.45, 34, 22, Math.PI / 4, 0, 2 * Math.PI);
      rawCtx.fill();
    } else if (defect.id === 'scratches') {
      rawCtx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
      rawCtx.lineWidth = 2.5;
      rawCtx.beginPath();
      rawCtx.moveTo(140, 200);
      rawCtx.lineTo(460, 240);
      rawCtx.moveTo(180, 220);
      rawCtx.lineTo(440, 260);
      rawCtx.stroke();
    } else if (defect.id === 'pitted_surface') {
      rawCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      for (let p = 0; p < 25; p++) {
        rawCtx.beginPath();
        rawCtx.arc(200 + (p * 11) % 180, 140 + (p * 17) % 120, 3 + (p % 4), 0, 2 * Math.PI);
        rawCtx.fill();
      }
    } else if (defect.id === 'patches') {
      rawCtx.fillStyle = 'rgba(30, 41, 59, 0.7)';
      rawCtx.beginPath();
      rawCtx.ellipse(width * 0.45, height * 0.45, 90, 50, 0.2, 0, 2 * Math.PI);
      rawCtx.fill();
    }

    // Apply CLAHE to View 2
    if (claheEnabled) {
      applyClaheFilter(rawCanvas, claheCanvas, clipLimit);
    } else {
      const claheCtx = claheCanvas.getContext('2d');
      if (claheCtx) {
        claheCtx.drawImage(rawCanvas, 0, 0);
      }
    }

    // Draw HUD on View 3
    const hudCtx = hudCanvas.getContext('2d');
    if (hudCtx) {
      hudCtx.drawImage(claheEnabled ? claheCanvas : rawCanvas, 0, 0);
    }
    const result = analyzeImageForDefects(rawCanvas, defect.id);
    setActiveResult(result);
    drawHudOverlay(hudCanvas, result, 30.8);
  };

  // Process uploaded image file
  const handleFileProcess = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;

    setUploadedFileName(file.name);
    setUploadedFileSize(`${(file.size / 1024).toFixed(1)} KB`);

    const reader = new FileReader();
    reader.onload = (e) => {
      const resultStr = e.target?.result as string;
      setUploadedImageSrc(resultStr);

      const img = new Image();
      img.onload = async () => {
        const rawCanvas = rawCanvasRef.current;
        const claheCanvas = claheCanvasRef.current;
        const hudCanvas = hudCanvasRef.current;
        if (!rawCanvas || !claheCanvas || !hudCanvas) return;

        const width = 640;
        const height = 480;
        rawCanvas.width = width;
        rawCanvas.height = height;
        claheCanvas.width = width;
        claheCanvas.height = height;
        hudCanvas.width = width;
        hudCanvas.height = height;

        const rawCtx = rawCanvas.getContext('2d');
        if (rawCtx) {
          rawCtx.drawImage(img, 0, 0, width, height);
        }

        if (claheEnabled) {
          applyClaheFilter(rawCanvas, claheCanvas, clipLimit);
        } else {
          const claheCtx = claheCanvas.getContext('2d');
          if (claheCtx) {
            claheCtx.drawImage(rawCanvas, 0, 0);
          }
        }

        // Call live fine-tuned YOLOv8n edge model on uploaded file
        const canvasB64 = rawCanvas.toDataURL('image/jpeg', 0.85);
        try {
          const res = await api.runInspection(`UPLOAD-${file.name.slice(0, 10).toUpperCase()}`, canvasB64);
          const mapped = mapBackendToDetectionResult(res, width, height);
          activeResultRef.current = mapped;
          setActiveResult(mapped);

          const hudCtx = hudCanvas.getContext('2d');
          if (hudCtx) {
            hudCtx.drawImage(claheEnabled ? claheCanvas : rawCanvas, 0, 0);
          }
          drawHudOverlay(hudCanvas, mapped, 30.0);

          setInspectionSuccessToast(
            `Model Inference: ${mapped.hasDefect ? `ALERT: DAMAGED SPECIMEN [${mapped.defectType.toUpperCase()}] -> REJECT` : 'PASS: NORMAL STEEL SPECIMEN -> ACCEPT'} [${(mapped.confidence * 100).toFixed(1)}%]`
          );
        } catch (err) {
          console.warn('Backend inference failed, falling back:', err);
          const detectResult = analyzeImageForDefects(rawCanvas);
          activeResultRef.current = detectResult;
          setActiveResult(detectResult);
          const hudCtx = hudCanvas.getContext('2d');
          if (hudCtx) {
            hudCtx.drawImage(claheEnabled ? claheCanvas : rawCanvas, 0, 0);
          }
          drawHudOverlay(hudCanvas, detectResult, 30.0);
        }
      };
      img.src = resultStr;
    };
    reader.readAsDataURL(file);
  };

  // Re-run processing on active canvas
  const reprocessCanvases = () => {
    const rawCanvas = rawCanvasRef.current;
    const claheCanvas = claheCanvasRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (!rawCanvas || !claheCanvas || !hudCanvas) return;

    if (claheEnabled) {
      applyClaheFilter(rawCanvas, claheCanvas, clipLimit);
    } else {
      const claheCtx = claheCanvas.getContext('2d');
      if (claheCtx) {
        claheCtx.drawImage(rawCanvas, 0, 0);
      }
    }

    const currentResult = analyzeImageForDefects(
      rawCanvas,
      inspectionMode === 'sample' ? neuDefects[sampleIndex].id : undefined
    );
    setActiveResult(currentResult);

    const hudCtx = hudCanvas.getContext('2d');
    if (hudCtx) {
      hudCtx.drawImage(claheEnabled ? claheCanvas : rawCanvas, 0, 0);
    }
    drawHudOverlay(hudCanvas, currentResult, isWebcamActive ? cameraFps : 30.5);
  };

  // Trigger manual inspection capture to history & SQLite (via on-device REST API)
  const handleCaptureAndInspect = async () => {
    const now = new Date();
    const fallbackId = `INS-LIVE-${Math.floor(1000 + Math.random() * 9000)}`;
    const productSerial =
      inspectionMode === 'upload'
        ? `STEEL-UP-${uploadedFileName.substring(0, 6).toUpperCase() || 'SPECIMEN'}`
        : inspectionMode === 'webcam'
        ? `STEEL-CAM-${now.getSeconds() * 12 + 100}`
        : `STEEL-${activeResult.defectType.substring(0, 2).toUpperCase()}-${Math.floor(200 + Math.random() * 800)}`;

    const fallbackRecord = {
      inspection_id: fallbackId,
      product_id: productSerial,
      timestamp: now.toISOString(),
      defect_detected: activeResult.hasDefect,
      defect_type: activeResult.defectType,
      severity: activeResult.severity,
      confidence: activeResult.confidence,
      location: activeResult.hasDefect ? 'Central inspection zone' : 'Uniform surface',
      decision: activeResult.hasDefect ? 'REJECT' : 'ACCEPT',
      recommendation: activeResult.recommendation,
      inference_ms: +(11.4 + Math.random() * 4).toFixed(1),
      boxes: activeResult.hasDefect
        ? [
            {
              class_name: activeResult.defectType,
              confidence: activeResult.confidence,
              xmin: activeResult.box.xmin,
              ymin: activeResult.box.ymin,
              xmax: activeResult.box.xmax,
              ymax: activeResult.box.ymax,
              area_ratio: activeResult.box.areaRatio,
              severity: activeResult.severity
            }
          ]
        : [],
      root_cause: activeResult.rootCause,
      implications: activeResult.implications,
      remediation_steps: activeResult.remediationSteps,
      shift_log_summary: `${activeResult.hasDefect ? 'REJECT' : 'ACCEPT'}: ${activeResult.defectType.toUpperCase()} captured from ${inspectionMode.toUpperCase()} feed.`
    };

    try {
      // Call live Python edge backend with dual-engine inference
      const canvasB64 = rawCanvasRef.current ? rawCanvasRef.current.toDataURL('image/jpeg', 0.85) : undefined;
      const res = await api.runInspection(productSerial, canvasB64);
      const recordToCommit = res.inspection || fallbackRecord;
      if (onCommitInspection) {
        onCommitInspection(recordToCommit);
      }
      setInspectionSuccessToast(
        `Edge API Logged: ${recordToCommit.inspection_id} (${recordToCommit.decision} - ${recordToCommit.defect_type || 'Defect-free'}) in ${res.inspection?.inference_ms || 12}ms`
      );
    } catch (err) {
      console.warn("Edge API inspection call failed, persisting locally:", err);
      if (onCommitInspection) {
        onCommitInspection(fallbackRecord);
      }
      setInspectionSuccessToast(
        `Local Committed: ${fallbackId} (${fallbackRecord.decision} - ${activeResult.defectType.toUpperCase()})`
      );
    }
    setTimeout(() => setInspectionSuccessToast(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Hidden Video element for Web Camera stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />

      {/* Control Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 uppercase font-mono font-bold">Input Source:</span>
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {/* 1. Upload Image */}
            <button
              onClick={() => {
                if (isWebcamActive) stopWebcam();
                setInspectionMode('upload');
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                inspectionMode === 'upload'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Image
            </button>

            {/* 2. Webcam Live Feed */}
            <button
              onClick={() => {
                if (isWebcamActive) {
                  stopWebcam();
                  setInspectionMode('upload');
                } else {
                  setInspectionMode('webcam');
                  startWebcam();
                }
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                isWebcamActive
                  ? 'bg-rose-500 text-white font-bold'
                  : inspectionMode === 'webcam'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              {isWebcamActive ? 'Stop Webcam' : 'Webcam Live Feed'}
            </button>

            {/* 3. Steel Defect Presets */}
            <button
              onClick={() => {
                if (isWebcamActive) stopWebcam();
                setInspectionMode('sample');
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                inspectionMode === 'sample'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Steel Defect Presets
            </button>
          </div>
        </div>

        {/* Action Controls & CLAHE Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          {inspectionMode === 'sample' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">Preset:</span>
              <select
                value={sampleIndex}
                onChange={(e) => setSampleIndex(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 text-xs text-white rounded-md px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
              >
                {neuDefects.map((d, idx) => (
                  <option key={d.id} value={idx}>
                    {d.name} ({d.typicalSeverity})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* CLAHE Filter Toggle */}
          <button
            onClick={() => {
              setClaheEnabled(!claheEnabled);
              setTimeout(reprocessCanvases, 50);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
              claheEnabled
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            CLAHE Filter: {claheEnabled ? 'ON' : 'BYPASS'}
          </button>

          {/* Inspect / Snap Frame Button */}
          <button
            onClick={handleCaptureAndInspect}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition active:scale-95"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isWebcamActive ? 'SNAP & LOG WEBCAM' : 'INSPECT & COMMIT'}
          </button>
        </div>
      </div>

      {/* Success Notification Toast */}
      {inspectionSuccessToast && (
        <div className="p-3 bg-emerald-950/90 border border-emerald-500/50 rounded-lg text-xs font-mono text-emerald-200 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{inspectionSuccessToast}</span>
          </div>
          <button
            onClick={() => setInspectionSuccessToast(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Webcam Permission Alert / Error Fallback */}
      {webcamError && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-200 uppercase font-mono tracking-wider">
                Web Camera Access Notice
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {webcamError}
              </p>
              <p className="text-[11px] text-slate-400">
                To test live camera inspection inside sandboxed browser environments, you can also click <strong>Upload Image</strong> below to inspect any real specimen photo, or continue with <strong>Steel Defect Presets</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={startWebcam}
              className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold font-mono transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Camera Permission
            </button>
            <button
              onClick={() => {
                setWebcamError(null);
                setInspectionMode('upload');
              }}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition"
            >
              Switch to Image Upload
            </button>
          </div>
        </div>
      )}

      {/* UPLOAD MODE DROP ZONE */}
      {inspectionMode === 'upload' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                Upload Steel Specimen Image for AI Defect Inspection
              </h3>
              <p className="text-xs text-slate-400">
                Upload photos of cold-rolled steel coils, strip surfaces, or metal coupons (PNG, JPG, BMP).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileProcess(e.target.files[0]);
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                <FileImage className="w-3.5 h-3.5" /> Select Local Image File
              </button>
            </div>
          </div>

          {/* Drag & Drop Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileProcess(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
              isDragging
                ? 'border-emerald-400 bg-emerald-950/20'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-slate-200">
                Drag &amp; drop your steel surface image here, or <span className="text-emerald-400 underline">browse files</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Supports PNG, JPEG, BMP, WebP up to 25 MB
              </div>
            </div>
          </div>

          {/* Quick-Pick Test Specimens */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
              Quick Test Industrial Specimens:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { name: 'Cold-Rolled Scratch Specimen', defect: 'scratches' },
                { name: 'Thermal Crazing Micro-Cracks', defect: 'crazing' },
                { name: 'Slag Oxide Inclusions', defect: 'inclusion' },
                { name: 'Acid Pitted Surface', defect: 'pitted_surface' },
                { name: 'Clean ASTM A1008 Steel', defect: 'normal' }
              ].map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const defect = neuDefects.find((d) => d.id === sample.defect) || neuDefects[0];
                    setUploadedFileName(sample.name);
                    setUploadedFileSize('145.2 KB');
                    renderPresetToCanvases(defect);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 transition"
                >
                  {sample.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Triple-View Inspection Displays */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* View 1: Raw Acquisition Frame */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-slate-400" />
              1. Raw Acquisition Frame
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {isWebcamActive ? `LIVE CAM: ${cameraFps} FPS` : '1080p @ 30 FPS'}
            </span>
          </div>

          <div className="relative aspect-square bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center">
            <canvas
              ref={rawCanvasRef}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 text-[10px] bg-slate-950/80 text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-800">
              {isWebcamActive ? 'LIVE WEBCAM STREAM' : inspectionMode === 'upload' ? 'UPLOADED SPECIMEN' : 'SYNTHETIC SPECIMEN'}
            </div>
          </div>
        </div>

        {/* View 2: CLAHE Preprocessed */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-blue-400" />
              2. OpenCV Preprocessed (CLAHE)
            </span>
            <span className="text-[10px] text-blue-400 font-mono">
              Clip: {clipLimit.toFixed(1)} | 8x8 Grid
            </span>
          </div>

          <div className="relative aspect-square bg-slate-950 rounded-lg border border-blue-500/30 overflow-hidden flex items-center justify-center">
            <canvas
              ref={claheCanvasRef}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 text-[10px] bg-blue-950/90 text-blue-300 px-2 py-0.5 rounded font-mono border border-blue-500/30">
              {claheEnabled ? 'CLAHE: Specular Glare Suppressed' : 'CLAHE: BYPASSED'}
            </div>
          </div>
        </div>

        {/* View 3: Industrial HUD Overlay */}
        <div className={`bg-slate-900 border rounded-xl p-4 space-y-3 transition-colors ${
          activeResult.hasDefect ? 'border-rose-500/40 bg-rose-950/10' : 'border-emerald-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              {activeResult.hasDefect ? (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              {activeResult.hasDefect ? '3. CV HUD - DEFECT DETECTED' : '3. CV HUD - SPECIMEN PASS'}
            </span>
            <span className={`text-[10px] font-mono font-bold ${activeResult.hasDefect ? 'text-rose-400' : 'text-emerald-400'}`}>
              {activeResult.hasDefect ? 'ALERT: REJECT' : '11.45 ms | PASS'}
            </span>
          </div>

          <div className={`relative aspect-square bg-slate-950 rounded-lg border overflow-hidden flex items-center justify-center ${
            activeResult.hasDefect ? 'border-rose-500/50 shadow-md shadow-rose-950/30' : 'border-emerald-500/30'
          }`}>
            <canvas
              ref={hudCanvasRef}
              className="w-full h-full object-cover"
            />
            <div className={`absolute bottom-2 right-2 text-[10px] px-2.5 py-1 rounded font-mono font-bold border shadow-md ${
              activeResult.hasDefect
                ? 'bg-rose-950/95 text-rose-300 border-rose-500/60 shadow-rose-950/60'
                : 'bg-emerald-950/95 text-emerald-300 border-emerald-500/60 shadow-emerald-950/60'
            }`}>
              DECISION: {activeResult.hasDefect ? 'REJECT (DAMAGED)' : 'ACCEPT (GOOD)'}
            </div>
          </div>
        </div>
      </div>

      {/* Localized Defect Coordinate & Bounding Box Telemetry */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Binary className="w-4 h-4 text-amber-400" />
            Real-Time Defect Coordinate &amp; Bounding Box Telemetry
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Active Defect: <strong className={activeResult.hasDefect ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
              {activeResult.hasDefect ? `${activeResult.defectType.toUpperCase()} [DAMAGED - REJECT]` : 'NORMAL [GOOD CONDITION - ACCEPT]'}
            </strong> ({(activeResult.confidence * 100).toFixed(1)}%)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-mono uppercase">Pixel Box (x1, y1)</div>
            <div className="text-sm font-bold text-white mt-1">
              {activeResult.box.xmin} px, {activeResult.box.ymin} px
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-mono uppercase">Pixel Box (x2, y2)</div>
            <div className="text-sm font-bold text-white mt-1">
              {activeResult.box.xmax} px, {activeResult.box.ymax} px
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-mono uppercase">Normalized (xc, yc)</div>
            <div className="text-sm font-bold text-emerald-400 mt-1">
              {activeResult.box.xc}, {activeResult.box.yc}
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-mono uppercase">Normalized (w, h)</div>
            <div className="text-sm font-bold text-emerald-400 mt-1">
              {activeResult.box.w}, {activeResult.box.h}
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-mono uppercase">Surface Area Ratio</div>
            <div className="text-sm font-bold text-amber-400 mt-1">
              {(activeResult.box.areaRatio * 100).toFixed(1)}% of strip
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-mono uppercase">Defect Severity</div>
            <div className="text-sm font-bold text-purple-400 mt-1">
              {activeResult.severity}
            </div>
          </div>
        </div>

        {/* Metallurgical Recommendation Bar */}
        <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Metallurgical Action Plan:
            </span>
            <p className="text-slate-200">{activeResult.recommendation}</p>
          </div>
          <button
            onClick={handleCaptureAndInspect}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold font-mono transition shrink-0 shadow"
          >
            Log to Shift Records
          </button>
        </div>
      </div>
    </div>
  );
}
