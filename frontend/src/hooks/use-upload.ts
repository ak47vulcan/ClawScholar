"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api-client";

interface UploadedDoc {
  id: string;
  filename: string;
  file_type: string;
  embedding_status: string;
  chunk_count: number;
  created_at: string;
  summary?: string | null;
  source_url?: string | null;
  source_type?: string | null;
}

export function useUpload() {
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(async (file: File, onProgress?: (pct: number) => void): Promise<UploadedDoc> => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      return await api.upload<UploadedDoc>("/documents/upload", formData, onProgress);
    } finally {
      setUploading(false);
    }
  }, []);

  return { upload, uploading };
}
