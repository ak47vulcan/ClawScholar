"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, CheckCircle2 } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useUIStore } from "@/stores/ui-store";
import { useUpload } from "@/hooks/use-upload";
import { dropZoneVariants } from "@/lib/motion-variants";
import { useState } from "react";

const ACCEPTED_EXT = ".csv,.pdf,.xlsx,.txt";

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const { uploadQueue, addToUploadQueue, updateUploadProgress, removeFromQueue, addDocument } = useDocumentStore();
  const addToast = useUIStore((s) => s.addToast);
  const { upload } = useUpload();

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((file) => {
        const qid = crypto.randomUUID();
        addToUploadQueue({ id: qid, file, progress: 0, status: "uploading" });

        upload(file, (pct) => updateUploadProgress(qid, pct))
          .then((doc) => {
            updateUploadProgress(qid, 100);
            addDocument({
              id: doc.id,
              filename: doc.filename,
              fileType: doc.file_type,
              embeddingStatus: doc.embedding_status as "PENDING",
              chunkCount: doc.chunk_count,
              createdAt: doc.created_at,
            });
            setTimeout(() => removeFromQueue(qid), 2000);
            addToast({ type: "success", message: `${file.name} uploaded & indexing…` });
          })
          .catch((err: unknown) => {
            removeFromQueue(qid);
            addToast({
              type: "error",
              message: err instanceof Error ? err.message : `Failed to upload ${file.name}`,
            });
          });
      });
    },
    [upload, addToUploadQueue, updateUploadProgress, removeFromQueue, addDocument, addToast]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="flex flex-col gap-3">
      <motion.div
        variants={dropZoneVariants}
        animate={isDragging ? "active" : "idle"}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`drop-zone ${isDragging ? "drop-zone-active" : ""} flex flex-col items-center justify-center gap-3 py-8 cursor-pointer`}
        onClick={() => document.getElementById("file-input-lib")?.click()}
      >
        <motion.div
          animate={{ y: isDragging ? -4 : 0 }}
          transition={{ duration: 0.15 }}
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--surface-3)" }}
        >
          <Upload size={22} className="text-indigo-400" />
        </motion.div>
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {isDragging ? "Drop files here" : "Drop files or click to upload"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Supports CSV, PDF, XLSX, TXT
          </p>
        </div>
        <input
          id="file-input-lib"
          type="file"
          className="hidden"
          accept={ACCEPTED_EXT}
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </motion.div>

      {uploadQueue.length > 0 && (
        <div className="flex flex-col gap-2">
          {uploadQueue.map((item) => (
            <div key={item.id} className="glass-flat px-3 py-2 flex items-center gap-3">
              {item.progress === 100 ? (
                <CheckCircle2 size={14} className="text-green-400 shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>
                  {item.file.name}
                </p>
                <div
                  className="mt-1 w-full h-0.5 rounded-full overflow-hidden"
                  style={{ background: "var(--surface-3)" }}
                >
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--muted)" }}>
                {item.progress}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
