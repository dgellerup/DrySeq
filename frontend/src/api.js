// src/api.js

// CRA reads REACT_APP_* at build time
export const API_BASE = (process.env.REACT_APP_API_BASE || 'http://localhost:5000').replace(/\/$/, '');

async function request(path, { method = 'GET', token, headers = {}, body } = {}) {
  const isForm = body instanceof FormData;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

// Auth
export const register = (username, password, inviteCode) =>
  request('/register', { method: 'POST', body: { username, password, inviteCode } });

export const login = (username, password) =>
  request('/login', { method: 'POST', body: { username, password } });

// Files
export const listFiles = (token) =>
  request('/files', { token });

export const uploadFile = (file, category, token) => {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category); // 'genomic' | 'primer'
  return request('/upload', { method: 'POST', token, body: form });
};

export const getDownloadUrl = (fileId, token) =>
  request(`/download/${fileId}/url`, { token });

export const deleteFile = (fileId, token) =>
  request(`/delete/${fileId}`, { method: 'DELETE', token });

// FASTA & analyses
export const analyzeFasta = (fileId, token) =>
  request('/analyze-fasta', { method: 'POST', token, body: { fileId } });

export const getAnalyses = (token) =>
  request('/analyses', { token });

// FASTQ / PCR workflows
export const getFastqFiles = (token) =>
  request('/fastq-files', { token });

export const createFastq = (primerFileId, referenceFileId, sampleName, sequenceCount, analysisName, token) =>
  request('/create-fastq', {
    method: 'POST',
    token,
    body: { primerFileId, referenceFileId, sampleName, sequenceCount, analysisName },
  });

export const runPcr = (primerFileId, referenceFileId, pcrAnalysisName, cyclesCount, token) =>
  request('/run-pcr', {
    method: 'POST',
    token,
    body: { primerFileId, referenceFileId, pcrAnalysisName, cyclesCount },
  });

export const deleteFastqAnalysis = (id, token) =>
  request(`/delete-fastq-analysis/${id}`, { method: 'DELETE', token });

export { API_BASE };
