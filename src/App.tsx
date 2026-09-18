import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Palette,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { zip } from "fflate";
import { SAMPLE_PHOTOS } from "./samples";
import { apiUrl } from "./api";

type Photo = {
  id: string;
  file: File;
  source: string;
  status: "queued" | "processing" | "done" | "error";
  result?: string;
  blob?: Blob;
  error?: string;
  width?: number;
  height?: number;
  seconds?: string;
  intensity?: number;
};
type Health = { ready: boolean; message: string };
const MAX_FILES = 20;
const MAX_BYTES = 12 * 1024 * 1024;
const outputName = (photo: Photo) =>
  `${photo.file.name.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "photo"}-colorized.png`;
function download(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function App() {
  const [sampleFiles, setSampleFiles] = useState<File[]>([]);
  const [sampleError, setSampleError] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [health, setHealth] = useState<Health | null>(null);
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [intensity, setIntensity] = useState(1);
  const [split, setSplit] = useState(50);
  const [view, setView] = useState<"compare" | "original" | "color">("compare");
  const [help, setHelp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const stop = useRef(false);
  const runLock = useRef(false);
  const dragDepth = useRef(0);
  const urls = useRef(new Set<string>());
  const helpClose = useRef<HTMLButtonElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const active = photos.find((photo) => photo.id === activeId) ?? photos[0];
  const completed = photos.filter((photo) => photo.status === "done");
  const queued = photos.filter(
    (photo) => photo.status === "queued" || photo.status === "error",
  );
  const registerUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  };
  const releaseUrl = (url?: string) => {
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }
  };
  const patch = (id: string, update: Partial<Photo>) =>
    setPhotos((list) =>
      list.map((photo) => (photo.id === id ? { ...photo, ...update } : photo)),
    );

  async function checkHealth() {
    try {
      const response = await fetch(apiUrl("/api/health"), {
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error();
      setHealth((await response.json()) as Health);
    } catch {
      setHealth({
        ready: false,
        message:
          "Backend unavailable or starting up. Wait a minute, then click the status indicator to retry.",
      });
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(
      SAMPLE_PHOTOS.map(async (sample) => {
        const response = await fetch(sample.url, { signal: controller.signal });
        if (!response.ok) throw new Error("Sample unavailable");
        const blob = await response.blob();
        return new File([blob], sample.filename, {
          type: "image/jpeg",
          lastModified: 0,
        });
      }),
    )
      .then((files) => {
        if (!controller.signal.aborted) setSampleFiles(files);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSampleError(true);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    void checkHealth();
    // Manual refresh avoids keeping a free server awake with background polling.
  }, []);
  useEffect(() => {
    const ownedUrls = urls.current;
    return () => {
      for (const url of ownedUrls) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (help) helpClose.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHelp(false);
        setExpanded(false);
        helpTrigger.current?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [help]);

  function addFiles(files: FileList | File[]) {
    if (runLock.current) return;
    const additions: Photo[] = [];
    const messages: string[] = [];
    const seen = new Set(
      photos.map(
        (photo) =>
          `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}`,
      ),
    );
    for (const file of Array.from(files)) {
      if (photos.length + additions.length >= MAX_FILES) {
        messages.push("You can add up to 20 photos per workspace.");
        break;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        messages.push(`${file.name}: use JPG, PNG, or WebP.`);
        continue;
      }
      if (!file.size || file.size > MAX_BYTES) {
        messages.push(
          `${file.name}: files must be nonempty and 12 MB or smaller.`,
        );
        continue;
      }
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.has(fingerprint)) {
        messages.push(`${file.name} is already in your workspace.`);
        continue;
      }
      seen.add(fingerprint);
      additions.push({
        id: crypto.randomUUID(),
        file,
        source: registerUrl(file),
        status: "queued",
      });
    }
    setPhotos((list) => [...list, ...additions]);
    if (!active && additions[0]) setActiveId(additions[0].id);
    setNotice(messages.join(" "));
  }
  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }
  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }
  function removePhoto(id: string) {
    if (runLock.current) return;
    const photo = photos.find((item) => item.id === id);
    releaseUrl(photo?.source);
    releaseUrl(photo?.result);
    setPhotos((list) => list.filter((item) => item.id !== id));
  }
  function clear() {
    if (runLock.current) return;
    photos.forEach((photo) => {
      releaseUrl(photo.source);
      releaseUrl(photo.result);
    });
    setPhotos([]);
    setActiveId(undefined);
    setNotice("");
  }
  async function processPhotos() {
    if (runLock.current || !health?.ready || !queued.length) return;
    runLock.current = true;
    stop.current = false;
    setStopping(false);
    setRunning(true);
    setNotice("");
    try {
      for (const photo of queued) {
        if (stop.current) break;
        patch(photo.id, { status: "processing", error: undefined });
        setActiveId(photo.id);
        const form = new FormData();
        form.append("file", photo.file);
        form.append("intensity", String(intensity));
        try {
          const response = await fetch(apiUrl("/api/colorize"), {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(180000),
          });
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as {
              detail?: unknown;
            };
            throw new Error(
              typeof data.detail === "string"
                ? data.detail
                : `Unable to process this photo (${response.status}).`,
            );
          }
          const blob = await response.blob();
          if (!blob.type.startsWith("image/png"))
            throw new Error("The backend returned an unexpected response.");
          const result = registerUrl(blob);
          patch(photo.id, {
            status: "done",
            result,
            blob,
            width: Number(response.headers.get("X-Image-Width")),
            height: Number(response.headers.get("X-Image-Height")),
            seconds: response.headers.get("X-Processing-Seconds") ?? undefined,
            intensity,
          });
          setView("compare");
        } catch (error) {
          patch(photo.id, {
            status: "error",
            error:
              error instanceof Error && error.name === "TimeoutError"
                ? "Processing timed out. Wait a moment, then retry."
                : error instanceof Error
                  ? error.message
                  : "Unable to reach the colorization server.",
          });
        }
      }
    } finally {
      runLock.current = false;
      setRunning(false);
      setStopping(false);
      void checkHealth();
    }
  }
  async function downloadAll() {
    if (!completed.length || zipping) return;
    setZipping(true);
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const [index, photo] of completed.entries())
        entries[`${String(index + 1).padStart(2, "0")}-${outputName(photo)}`] =
          new Uint8Array(await photo.blob!.arrayBuffer());
      const zipped = await new Promise<Uint8Array>((resolve, reject) =>
        zip(entries, { level: 0 }, (error, data) =>
          error ? reject(error) : resolve(data),
        ),
      );
      const url = registerUrl(
        new Blob([zipped as Uint8Array<ArrayBuffer>], {
          type: "application/zip",
        }),
      );
      download(url, "chroma-colorized-photos.zip");
      window.setTimeout(() => releaseUrl(url), 60000);
    } catch {
      setNotice(
        "Could not create the ZIP. Please use the individual photo downloads.",
      );
    } finally {
      setZipping(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#">
          <span className="brand-mark">
            <Palette size={23} strokeWidth={1.7} />
          </span>
          chroma<span className="brand-period">.</span>
        </a>
        <nav aria-label="Main navigation">
          <a className="nav-active" href="#studio">
            Color studio
          </a>
          <button ref={helpTrigger} onClick={() => setHelp(true)}>
            How it works <CircleHelp size={15} />
          </button>
        </nav>
        <span className="local-badge">
          <span /> Powered by a pretrained model
        </span>
      </header>
      <main id="studio">
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span /> A NEW CHAPTER FOR OLD PHOTOS
            </div>
            <h1>
              Some memories deserve
              <br />a little <span>color.</span>
              <svg
                aria-hidden="true"
                className="heading-spark"
                viewBox="0 0 44 48"
              >
                <path d="M22 2v13M42 16l-12 5M35 43l-8-12M3 32l12-7M7 6l9 11" />
              </svg>
            </h1>
            <p>
              Bring your black & white photos to life.
              <br className="mobile-break" /> Thoughtful color, powered by
              machine learning.
            </p>
          </div>
          <div className="intro-note">
            <div className="note-icon">
              <LockKeyhole size={20} />
            </div>
            <div>
              <strong>Your photos, thoughtfully handled.</strong>
              <span>
                Photos are sent to our server.
                <br />
                No third-party AI service is used.
              </span>
            </div>
          </div>
        </section>
        <div className="workspace-top">
          <div>
            <span className="section-number">01</span>
            <h2>Your color studio</h2>
            <span className="beta-tag">COLOR STUDIO</span>
          </div>
          <button
            className={`health ${health?.ready ? "ready" : ""}`}
            onClick={() => void checkHealth()}
            title={health?.message || "Check model status"}
          >
            <span />
            {health === null
              ? "Connecting to model"
              : health.ready
                ? "Model ready"
                : "Model offline"}
            <RefreshCw size={12} />
          </button>
        </div>
        {health && !health.ready && (
          <div className="model-notice" role="status">
            <ShieldCheck size={19} />
            <div>
              <strong>Let’s connect to the colorization server.</strong>
              <span>{health.message}</span>
              <code>python scripts/download_model.py</code>
            </div>
          </div>
        )}
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button aria-label="Dismiss message" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="workspace">
          <aside className="controls">
            <div className="panel-heading">
              <h3>Make room for color</h3>
              <span>Step 1 of 2</span>
            </div>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={onFiles}
              className="sr-only"
              tabIndex={-1}
              aria-label="Upload black and white photos"
            />
            <button
              className={`dropzone ${dragging ? "dragging" : ""}`}
              disabled={running}
              onClick={() => input.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current++;
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                if (--dragDepth.current <= 0) setDragging(false);
              }}
              onDrop={onDrop}
            >
              <span className="upload-icon">
                <Upload size={23} />
                <span>
                  <Plus size={12} />
                </span>
              </span>
              <strong>
                {dragging ? "Drop your memories here" : "Drop your photos here"}
              </strong>
              <span>
                or <b>browse files</b> on your device
              </span>
              <small>JPG, PNG, WebP · Up to 12 MB each</small>
            </button>
            <div className="batch-hint">
              <Layers3 size={15} />
              <span>
                A single memory or a whole collection.
                <br />
                Add up to 20 photos at once.
              </span>
            </div>
            <section
              className="samples"
              aria-label="Black and white sample photos"
            >
              <div className="samples-heading">
                <h3>No photo handy? Try a sample.</h3>
              </div>
              <div className="sample-grid">
                {SAMPLE_PHOTOS.map((sample, index) => {
                  const added = photos.some(
                    (photo) =>
                      photo.file.name === sample.filename &&
                      photo.file.lastModified === 0,
                  );
                  return (
                    <button
                      key={sample.filename}
                      className="sample-button"
                      disabled={running || !sampleFiles[index] || added}
                      aria-label={`${added ? "Added" : "Try sample"}: ${sample.name}`}
                      title={sample.credit}
                      onClick={() => addFiles([sampleFiles[index]])}
                    >
                      <img
                        src={sample.url}
                        alt={`Black and white ${sample.name.toLowerCase()} sample`}
                      />
                      <span>
                        {sample.name}
                        {added ? <Check size={12} /> : <Plus size={12} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p>
                {sampleError
                  ? "Sample photos could not load. Refresh to retry, or upload your own."
                  : "Choose a photo, then click Colorize. Samples are included locally."}
              </p>
            </section>
            <div className="control-divider" />
            <div className="panel-heading">
              <h3>The finishing touch</h3>
              <span>Step 2 of 2</span>
            </div>
            <label className="range-label" htmlFor="intensity">
              Color intensity <span>{Math.round(intensity * 100)}%</span>
            </label>
            <input
              id="intensity"
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={intensity}
              disabled={running}
              onChange={(event) => setIntensity(Number(event.target.value))}
            />
            <div className="range-ends">
              <span>Subtle</span>
              <span>Vibrant</span>
            </div>
            <p className="control-caption">
              A little less for a softer look. A little more for a brighter
              story. Applies to your next run.
            </p>
            <button
              className="primary-button"
              disabled={running || !queued.length || !health?.ready}
              onClick={() => void processPhotos()}
            >
              {running ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Sparkles size={18} />
              )}{" "}
              {running
                ? "Bringing color to life…"
                : `Colorize ${queued.length ? `${queued.length} photo${queued.length === 1 ? "" : "s"}` : "photos"}`}
              {!running && <ArrowRight size={17} />}
            </button>
            {running && (
              <button
                className="stop-button"
                disabled={stopping}
                onClick={() => {
                  stop.current = true;
                  setStopping(true);
                }}
              >
                {stopping
                  ? "Stopping after this photo…"
                  : "Stop after current photo"}
              </button>
            )}
            <div className="private-caption">
              <LockKeyhole size={12} /> Processed on our server · Download to
              keep
            </div>
          </aside>
          <section
            className={`preview-panel ${expanded ? "expanded" : ""}`}
            aria-label="Photo preview"
          >
            <div className="preview-toolbar">
              <div
                className="preview-tabs"
                role="group"
                aria-label="Preview mode"
              >
                {(["compare", "original", "color"] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={view === mode}
                    disabled={
                      !active || (mode !== "original" && !active.result)
                    }
                    className={view === mode ? "selected" : ""}
                    onClick={() => setView(mode)}
                  >
                    {mode === "compare"
                      ? "Before & after"
                      : mode === "original"
                        ? "Original"
                        : "Colorized"}
                  </button>
                ))}
              </div>
              <button
                className="icon-button"
                aria-label={
                  expanded ? "Close enlarged preview" : "Enlarge preview"
                }
                disabled={!active}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <X size={17} /> : <Maximize2 size={16} />}
              </button>
            </div>
            <div className={`preview-stage ${active ? "has-photo" : ""}`}>
              {active ? (
                <>
                  <div
                    className="comparison"
                    style={{
                      aspectRatio:
                        active.width && active.height
                          ? `${active.width} / ${active.height}`
                          : undefined,
                    }}
                  >
                    <img
                      className="base-image"
                      src={
                        view === "original" || !active.result
                          ? active.source
                          : active.result
                      }
                      alt={
                        view === "original" || !active.result
                          ? `Original: ${active.file.name}`
                          : `Colorized: ${active.file.name}`
                      }
                      onError={() =>
                        setNotice(
                          "Your browser could not preview this file. The backend will validate it when processed.",
                        )
                      }
                    />
                    {view === "compare" && active.result && (
                      <>
                        <img
                          className="before-image"
                          src={active.source}
                          alt="Original before colorization"
                          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                        />
                        <div
                          className="split-line"
                          style={{ left: `${split}%` }}
                        >
                          <span>‹ ›</span>
                        </div>
                        <input
                          className="comparison-input"
                          type="range"
                          min="0"
                          max="100"
                          value={split}
                          onChange={(event) =>
                            setSplit(Number(event.target.value))
                          }
                          aria-label="Compare original and colorized photo"
                        />
                        <span className="image-label label-before">
                          ORIGINAL
                        </span>
                        <span className="image-label label-after">
                          COLORIZED
                        </span>
                      </>
                    )}
                  </div>
                  {active.status === "processing" && (
                    <div className="processing-overlay" role="status">
                      <LoaderCircle className="spin" size={28} />
                      <strong>Finding the colors in your story</strong>
                      <span>Running our pretrained model…</span>
                    </div>
                  )}
                  {active.status === "error" && (
                    <div className="image-error" role="alert">
                      {active.error}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-preview">
                  <div className="photo-art" aria-hidden="true">
                    <div className="art-back" />
                    <div className="art-front">
                      <div className="art-landscape">
                        <span className="sun" />
                        <span className="hill hill-one" />
                        <span className="hill hill-two" />
                        <span className="hill hill-three" />
                        <div className="art-grayscale" />
                        <div className="art-split">
                          <span>‹ ›</span>
                        </div>
                      </div>
                      <div className="art-caption">
                        <span>A new perspective</span>
                        <Sparkles size={13} />
                      </div>
                    </div>
                    <div className="floating-spark">
                      <Sparkles size={21} />
                    </div>
                  </div>
                  <h3>The past, in a new light.</h3>
                  <p>
                    Your before & after preview will appear here.
                    <br />
                    Start by adding a black & white photo.
                  </p>
                  <span className="empty-step">
                    <span>1</span> Upload <ChevronRight size={12} />
                    <span>2</span> Colorize <ChevronRight size={12} />
                    <span>3</span> Rediscover
                  </span>
                </div>
              )}
            </div>
            <div className="preview-footer">
              <span>
                {active?.result ? (
                  <>
                    <Check size={14} />
                    {active.width} × {active.height} · PNG · {active.seconds}s
                  </>
                ) : (
                  <>
                    <ImagePlus size={15} />
                    {active
                      ? "Ready for a little color"
                      : "Every photo has another story to tell"}
                  </>
                )}
              </span>
              {active?.result ? (
                <button
                  onClick={() => download(active.result!, outputName(active))}
                >
                  <ArrowDownToLine size={15} /> Download
                </button>
              ) : (
                <span className="preview-format">PNG OUTPUT</span>
              )}
            </div>
          </section>
        </div>
        <section className="collection" aria-label="Your photos">
          <div className="collection-header">
            <div>
              <h2>Your collection</h2>
              <span className="count">
                {photos.length.toString().padStart(2, "0")}
              </span>
              {running && (
                <span className="progress-text" role="status">
                  {completed.length} of {photos.length} complete
                </span>
              )}
            </div>
            <div>
              <button
                className="text-button"
                disabled={!photos.length || running}
                onClick={clear}
              >
                Clear all
              </button>
              <button
                className="secondary-button"
                disabled={!completed.length || zipping}
                onClick={() => void downloadAll()}
              >
                {zipping ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <ArrowDownToLine size={15} />
                )}{" "}
                {zipping ? "Preparing ZIP…" : "Download all"}
                {completed.length > 0 && <span>{completed.length}</span>}
              </button>
            </div>
          </div>
          {photos.length ? (
            <div className="photo-grid">
              {photos.map((photo) => (
                <article
                  key={photo.id}
                  className={`photo-card ${active?.id === photo.id ? "active" : ""}`}
                >
                  <button
                    className="photo-select"
                    onClick={() => {
                      setActiveId(photo.id);
                      setSplit(50);
                    }}
                    aria-label={`Preview ${photo.file.name}`}
                    aria-pressed={active?.id === photo.id}
                  >
                    <img
                      src={photo.result || photo.source}
                      alt={photo.file.name}
                    />
                    <span className={`status status-${photo.status}`}>
                      {photo.status === "processing" ? (
                        <LoaderCircle size={11} className="spin" />
                      ) : photo.status === "done" ? (
                        <Check size={11} />
                      ) : null}
                      {photo.status === "done"
                        ? "Colorized"
                        : photo.status === "error"
                          ? "Needs retry"
                          : photo.status === "processing"
                            ? "Processing"
                            : "In queue"}
                    </span>
                  </button>
                  <div className="photo-info">
                    <div>
                      <strong title={photo.file.name}>{photo.file.name}</strong>
                      <span>
                        {photo.status === "done"
                          ? `${photo.width} × ${photo.height} · ${Math.round((photo.intensity ?? 1) * 100)}% color`
                          : `${(photo.file.size / 1024 / 1024).toFixed(1)} MB · Original`}
                      </span>
                    </div>
                    {photo.result && (
                      <button
                        className="icon-button"
                        onClick={() =>
                          download(photo.result!, outputName(photo))
                        }
                        aria-label={`Download ${photo.file.name}`}
                      >
                        <ArrowDownToLine size={15} />
                      </button>
                    )}
                    <button
                      className="icon-button remove-button"
                      disabled={running}
                      onClick={() => removePhoto(photo.id)}
                      aria-label={`Remove ${photo.file.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {photo.error && <p className="card-error">{photo.error}</p>}
                </article>
              ))}
              {photos.length < MAX_FILES && (
                <button
                  className="add-card"
                  disabled={running}
                  onClick={() => input.current?.click()}
                >
                  <Plus size={23} />
                  <span>Add more photos</span>
                </button>
              )}
            </div>
          ) : (
            <div className="collection-empty">
              <span>
                <Layers3 size={20} />
              </span>
              <div>
                <strong>A collection of possibilities.</strong>
                <p>
                  Your uploaded photos and colorized results will live here for
                  this session.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => input.current?.click()}
              >
                Add your first photo <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
        <section className="principles">
          <div>
            <span>
              <ShieldCheck size={20} />
            </span>
            <div>
              <h3>Private by design</h3>
              <p>No third-party AI service receives your photos.</p>
            </div>
          </div>
          <div>
            <span>
              <Layers3 size={20} />
            </span>
            <div>
              <h3>Made for your collection</h3>
              <p>One photo or a batch, in one place.</p>
            </div>
          </div>
          <div>
            <span>
              <CheckCheck size={20} />
            </span>
            <div>
              <h3>Ready to keep & share</h3>
              <p>Download crisp, colorized PNGs.</p>
            </div>
          </div>
        </section>
        <footer>
          <a className="brand" href="#">
            chroma<span className="brand-period">.</span>
          </a>
          <span>A little color. A new perspective.</span>
          <span>
            Built by{" "}
            <a
              className="author-link"
              href="https://github.com/AryanSehgal"
              target="_blank"
              rel="noopener noreferrer"
            >
              Aryan Sehgal
            </a>{" "}
            <span className="footer-dot">✦</span>
          </span>
        </footer>
      </main>
      {help && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setHelp(false);
            helpTrigger.current?.focus();
          }}
        >
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                event.preventDefault();
                helpClose.current?.focus();
              }
            }}
          >
            <button
              ref={helpClose}
              className="modal-close icon-button"
              aria-label="Close help"
              onClick={() => {
                setHelp(false);
                helpTrigger.current?.focus();
              }}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">A LITTLE SCIENCE. A LITTLE MAGIC.</span>
            <h2 id="help-title">From grayscale to possibility.</h2>
            <ol>
              <li>
                <strong>Add your photos.</strong> Choose up to 20 JPEG, PNG, or
                WebP images, up to 12 MB each. Image dimensions must fit the
                server’s configured limit.
              </li>
              <li>
                <strong>Find your color.</strong> Adjust intensity, then
                colorize. A pretrained ECCV 2016 neural network predicts color
                on our server’s CPU.
              </li>
              <li>
                <strong>Make them yours.</strong> Drag the comparison slider and
                download individual PNGs or your whole collection as a ZIP.
              </li>
            </ol>
            <p>
              The model imagines plausible colors; it cannot know the original
              colors. Large images are resized to the server’s configured output
              limit. Transparency is flattened onto white. Results live in this
              tab until you clear it or refresh, so download what you want to
              keep.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
export default App;
