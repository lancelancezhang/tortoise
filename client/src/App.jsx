import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listRecordings, saveRecording, getAudioUrl, getPhotoUrl, deleteRecording, updateRecording, listFamilyMembers, addFamilyMember, updateFamilyMember, deleteFamilyMember } from './api';

// --- Recording draft recovery (IndexedDB) ---
// Fix: long recordings can lose audio if the browser/OS interrupts before stop().
// We record in 1s chunks and checkpoint them to IndexedDB.
const DRAFT_DB = 'stories2-recording-drafts';
const DRAFT_STORE = 'chunks';
const META_STORE = 'meta';

function openDraftDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DRAFT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'draftId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function draftPutMeta(meta) {
  const db = await openDraftDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(meta);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function draftPutChunk(draftId, seq, blob) {
  const db = await openDraftDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).put({ key: `${draftId}:${seq}`, draftId, seq, blob });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function draftListChunks(draftId) {
  const db = await openDraftDb();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readonly');
    const req = tx.objectStore(DRAFT_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return (all || [])
    .filter((c) => c.draftId === draftId)
    .sort((a, b) => a.seq - b.seq)
    .map((c) => c.blob)
    .filter(Boolean);
}

async function draftGetLatestMeta() {
  const db = await openDraftDb();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return (all || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}

async function draftClear(draftId) {
  const db = await openDraftDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([DRAFT_STORE, META_STORE], 'readwrite');
    const chunkStore = tx.objectStore(DRAFT_STORE);
    const metaStore = tx.objectStore(META_STORE);
    const keysReq = chunkStore.getAllKeys();
    keysReq.onsuccess = () => {
      (keysReq.result || []).forEach((key) => {
        if (typeof key === 'string' && key.startsWith(`${draftId}:`)) chunkStore.delete(key);
      });
      metaStore.delete(draftId);
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function getTimestampName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}-${min}-${s}`;
}

const LANGPAIR = { mandarin: 'zh-CN|en', korean: 'ko|en' };

async function translateToEnglish(text, spokenLanguage = 'mandarin') {
  if (!text?.trim()) return '';
  const langpair = LANGPAIR[spokenLanguage] || LANGPAIR.mandarin;
  const url = 'https://api.mymemory.translated.net/get?' + new URLSearchParams({
    q: text.trim(),
    langpair,
  });
  const res = await fetch(url);
  const data = await res.json();
  if (data.responseStatus === 200 && data.responseData?.translatedText) {
    return data.responseData.translatedText;
  }
  return '[Translation failed]';
}

const STORY_PROMPTS = [
  { promptText: 'Tell me about the happiest moment of your life', suggestedTitle: 'The happiest moment of my life' },
  { promptText: 'Tell me about a time you felt really proud', suggestedTitle: 'A time I felt really proud' },
  { promptText: 'Tell me about someone who changed your life', suggestedTitle: 'Someone who changed my life' },
  { promptText: 'Tell me about a place that feels like home', suggestedTitle: 'A place that feels like home' },
  { promptText: 'Tell me about a lesson you\'ll never forget', suggestedTitle: 'A lesson I\'ll never forget' },
];

function pickRandomPrompt() {
  return STORY_PROMPTS[Math.floor(Math.random() * STORY_PROMPTS.length)];
}

function getAuthorColor(id) {
  if (!id) return 'hsl(220, 20%, 85%)';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  h = h % 360;
  const s = 72;
  const l = 48;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export default function App() {
  const { familySlug } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [statusClass, setStatusClass] = useState('');
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [recoverableDraft, setRecoverableDraft] = useState(null);
  const [savedList, setSavedList] = useState([]);
  const [modalRecord, setModalRecord] = useState(null);
  const [modalRecordingOpen, setModalRecordingOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordTitle, setRecordTitle] = useState('');
  const [recordDescription, setRecordDescription] = useState('');
  const [recordStoryDate, setRecordStoryDate] = useState('');
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [confirmDiscardChangesOpen, setConfirmDiscardChangesOpen] = useState(false);
  const confirmDiscardChangesCallbackRef = useRef(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStoryDate, setEditStoryDate] = useState('');
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const detailMenuRef = useRef(null);
  const [modalImportOpen, setModalImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importTitle, setImportTitle] = useState('');
  const [importDescription, setImportDescription] = useState('');
  const [importStoryDate, setImportStoryDate] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [currentStoryPrompt, setCurrentStoryPrompt] = useState(null);
  const [recordingPrompt, setRecordingPrompt] = useState(null);
  const [recordingSuggestedTitle, setRecordingSuggestedTitle] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRelationship, setNewMemberRelationship] = useState('');
  const [newMemberAge, setNewMemberAge] = useState('');
  const [newMemberBirthday, setNewMemberBirthday] = useState('');
  const [recordFamilyMemberId, setRecordFamilyMemberId] = useState('');
  const [recordPhotoFile, setRecordPhotoFile] = useState(null);
  const [recordPhotoPreview, setRecordPhotoPreview] = useState(null);
  const [recordMode, setRecordMode] = useState('voice'); // 'voice' | 'photo'
  const [recordModeModalOpen, setRecordModeModalOpen] = useState(false);
  const [importFamilyMemberId, setImportFamilyMemberId] = useState('');
  const [editFamilyMemberId, setEditFamilyMemberId] = useState('');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [addFamilyModalOpen, setAddFamilyModalOpen] = useState(false);
  const [editingFamilyId, setEditingFamilyId] = useState(null);
  const [confirmDeleteFamilyId, setConfirmDeleteFamilyId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [spokenLanguage, setSpokenLanguage] = useState(() => {
    try {
      return localStorage.getItem('spokenLanguage') || 'mandarin';
    } catch {
      return 'mandarin';
    }
  });
  const spokenLanguageRef = useRef(spokenLanguage);
  const [uiLanguage, setUiLanguage] = useState(() => {
    try {
      return localStorage.getItem('uiLanguage') || 'en';
    } catch {
      return 'en';
    }
  });
  const isKo = uiLanguage === 'ko';

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const draftIdRef = useRef(null);
  const chunkSeqRef = useRef(0);
  const recognitionRef = useRef(null);
  const currentTranscriptRef = useRef('');
  const recordStartTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const analyserRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const recordingSuggestedTitleRef = useRef(null);

  const loadList = useCallback(async () => {
    if (!familySlug) return;
    try {
      const list = await listRecordings(familySlug);
      setSavedList(list);
    } catch {
      setSavedList([]);
    }
  }, [familySlug]);

  const loadFamilyMembers = useCallback(async () => {
    if (!familySlug) return;
    try {
      const list = await listFamilyMembers(familySlug);
      setFamilyMembers(list);
    } catch {
      setFamilyMembers([]);
    }
  }, [familySlug]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadFamilyMembers();
  }, [loadFamilyMembers]);

  useEffect(() => {
    if (!familySlug) return;
    try {
      const key = `family_onboarded_${familySlug}`;
      if (familyMembers.length === 0 && !localStorage.getItem(key)) {
        setOnboardingOpen(true);
        localStorage.setItem(key, '1');
      }
    } catch {
      // ignore storage errors
    }
  }, [familySlug, familyMembers]);

  useEffect(() => {
    spokenLanguageRef.current = spokenLanguage;
    try {
      localStorage.setItem('spokenLanguage', spokenLanguage);
    } catch {}
  }, [spokenLanguage]);

  useEffect(() => {
    try {
      localStorage.setItem('uiLanguage', uiLanguage);
    } catch {}
  }, [uiLanguage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await draftGetLatestMeta();
        if (cancelled) return;
        setRecoverableDraft(meta && meta.hasAudio ? meta : null);
      } catch {
        if (!cancelled) setRecoverableDraft(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startRecording = async () => {
    currentTranscriptRef.current = '';
    setTranscript('');
    setTranslation('');
    setShowResults(false);
    setAudioBlob(null);
    audioChunksRef.current = [];
    chunkSeqRef.current = 0;
    draftIdRef.current = `draft-${Date.now()}`;
    try {
      await draftPutMeta({
        draftId: draftIdRef.current,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        hasAudio: false,
      });
    } catch {}

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      mediaRecorder.ondataavailable = (e) => {
        if (!e.data || e.data.size <= 0) return;
        audioChunksRef.current.push(e.data);
        const draftId = draftIdRef.current;
        if (draftId) {
          const seq = chunkSeqRef.current++;
          draftPutChunk(draftId, seq, e.data).catch(() => {});
          draftPutMeta({ draftId, createdAt: Date.now(), updatedAt: Date.now(), hasAudio: true }).catch(() => {});
          setRecoverableDraft({ draftId, updatedAt: Date.now(), hasAudio: true });
        }
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        analyserRef.current = null;
        if (audioContextRef.current?.state !== 'closed') {
          audioContextRef.current?.close();
        }
        audioContextRef.current = null;
      };
      // Critical for long recordings: emit chunks during recording so audio isn't lost
      // if the browser/OS interrupts before stop().
      mediaRecorder.start(1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = spokenLanguage === 'korean' ? 'ko-KR' : 'zh-CN';
        rec.onresult = (event) => {
          let final = '';
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const r = event.results[i];
            const t = r[0].transcript;
            if (r.isFinal) final += t;
            else interim += t;
          }
          currentTranscriptRef.current = (currentTranscriptRef.current + final).replace(/\s+/g, ' ').trim();
          setTranscript(currentTranscriptRef.current + (interim ? ' ' + interim : ''));
        };
        rec.onerror = (e) => {
          if (e.error === 'aborted') return;
          const isMobile = /Android|webOS|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
          const overlayHint = isMobile && (e.error === 'not-allowed' || e.error === 'audio-capture');
          if (isKo) {
            setStatus(overlayHint ? '마이크를 사용할 수 없어요. 채팅 말풍선·띄워 둔 앱을 닫은 뒤 다시 시도해 주세요.' : '음성 인식 오류: ' + e.error);
          } else {
            setStatus(overlayHint ? 'Microphone blocked. Close chat bubbles or floating apps, then try again.' : 'Speech recognition error: ' + e.error);
          }
        };
        rec.start();
        recognitionRef.current = rec;
      } else {
        setTranscript('…');
        setStatus('Speech recognition not supported. Use Chrome or Edge.');
      }

      setIsRecording(true);
      setRecordingDuration(0);
      recordStartTimeRef.current = Date.now();
      setStatus('');
    } catch (err) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (typeof window !== 'undefined' && window.innerWidth < 600);
      if (isKo) {
        setStatus('마이크를 사용할 수 없어요. 휴대폰이면 채팅 말풍선·띄워 둔 앱을 모두 닫은 뒤 다시 시도해 주세요.');
      } else {
        setStatus(isMobile
          ? 'Microphone blocked. On phones: close any chat bubbles or floating apps (e.g. Messenger), then try again.'
          : 'Microphone access denied or not available.');
      }
    }
  };

  useEffect(() => {
    if (!isRecording) return;
    durationIntervalRef.current = setInterval(() => {
      if (recordStartTimeRef.current) {
        setRecordingDuration(Math.floor((Date.now() - recordStartTimeRef.current) / 1000));
      }
    }, 1000);
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    const canvas = waveformCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const barCount = 32;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId = null;

    const draw = () => {
      if (!analyserRef.current) return;
      rafId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      const barW = w / barCount;
      const gap = Math.max(1, Math.floor(barW * 0.25));
      const barWidth = barW - gap;
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#64748b';
      for (let i = 0; i < barCount; i++) {
        const j = Math.floor((i / barCount) * data.length);
        const v = data[j] / 255;
        const barH = Math.max(2, v * h * 0.7);
        const x = i * barW + gap / 2;
        const y = (h - barH) / 2;
        ctx.fillRect(x, y, barWidth, barH);
      }
    };
    draw();
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) return;
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!detailMenuOpen) return;
    const close = (e) => {
      if (detailMenuRef.current && !detailMenuRef.current.contains(e.target)) {
        setDetailMenuOpen(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [detailMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const close = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [moreMenuOpen]);

  const stopRecording = async () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

    setIsRecording(false);
    setStatus('Processing…', 'processing');

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    await new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        const raw = (currentTranscriptRef.current || transcript).replace(/^…\s*/, '').trim();
        const finalTranscript = raw || '(No speech detected)';
        setTranscript(finalTranscript);

        if (raw) {
          try {
            const translated = await translateToEnglish(raw, spokenLanguageRef.current);
            setTranslation(translated);
          } catch {
            setTranslation('[Translation failed]');
          }
        } else {
          setTranslation('');
        }

        const chunks = audioChunksRef.current;
        const blob = chunks.length ? new Blob(chunks, { type: 'audio/webm' }) : null;
        setAudioBlob(blob);
        setShowResults(true);
        setStatus('Done. Save or discard.');
        if (recordingSuggestedTitleRef.current) {
          setRecordTitle(recordingSuggestedTitleRef.current);
        }
        if (recordStartTimeRef.current) {
          setRecordingDuration(Math.floor((Date.now() - recordStartTimeRef.current) / 1000));
        }
        recordStartTimeRef.current = null;
        if (draftIdRef.current) {
          draftPutMeta({
            draftId: draftIdRef.current,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            hasAudio: !!blob,
            transcript: finalTranscript,
          }).catch(() => {});
        }
        resolve();
      };
      mediaRecorder.stop();
    });
  };

  const recoverLastRecording = useCallback(async () => {
    if (!recoverableDraft?.draftId) return;
    try {
      const blobs = await draftListChunks(recoverableDraft.draftId);
      const blob = blobs.length ? new Blob(blobs, { type: 'audio/webm' }) : null;
      if (!blob) {
        setStatus(isKo ? '복구할 녹음 파일이 없어요.' : 'No audio found to recover.');
        return;
      }
      setAudioBlob(blob);
      setShowResults(true);
      setModalRecordingOpen(true);
      setStatus(isKo ? '이전 녹음을 복구했어요. 저장하거나 버릴 수 있어요.' : 'Recovered the last recording. You can save or discard.');
    } catch {
      setStatus(isKo ? '복구에 실패했어요.' : 'Recovery failed.');
    }
  }, [recoverableDraft, isKo]);

  const handleSave = async () => {
    const titleTrimmed = recordTitle.trim();
    if (!titleTrimmed) {
      setStatus('Please enter a title to save.');
      return;
    }
    if (!audioBlob && !transcript.trim()) {
      setStatus('Nothing to save. Record first.');
      return;
    }
    const id = 'rec-' + Date.now();
    try {
      await saveRecording(familySlug, {
        id,
        name: titleTrimmed,
        createdAt: new Date().toISOString(),
        transcript: transcript.trim(),
        translation: translation.trim(),
        title: titleTrimmed,
        description: recordDescription.trim() || undefined,
        storyDate: recordStoryDate.trim() || undefined,
        familyMemberId: recordFamilyMemberId || undefined,
        audioBlob: audioBlob || undefined,
        photoFile: recordPhotoFile || undefined,
      });
      setStatus(`Saved as "${titleTrimmed}".`);
      loadList();
      try {
        if (draftIdRef.current) await draftClear(draftIdRef.current);
        if (recoverableDraft?.draftId && recoverableDraft.draftId !== draftIdRef.current) {
          await draftClear(recoverableDraft.draftId);
        }
      } catch {}
      draftIdRef.current = null;
      setRecoverableDraft(null);
      setShowResults(false);
      setTranscript('');
      setTranslation('');
      setAudioBlob(null);
      setRecordTitle('');
      setRecordDescription('');
      setRecordStoryDate('');
      setRecordPhotoFile(null);
      setRecordPhotoPreview(null);
      setModalRecordingOpen(false);
      setRecordingPrompt(null);
      setRecordingSuggestedTitle(null);
      recordingSuggestedTitleRef.current = null;
    } catch {
      setStatus('Save failed.');
    }
  };

  const openModal = (record) => {
    setModalRecord(record);
    setEditTitle(record?.title?.trim() ?? '');
    setEditDescription(record?.description?.trim() ?? '');
    setEditStoryDate(record?.storyDate?.trim() ?? '');
    setEditFamilyMemberId(record?.familyMemberId ?? '');
    setDetailEditMode(false);
    setDetailMenuOpen(false);
  };
  const closeModal = () => {
    setModalRecord(null);
    setConfirmDeleteId(null);
    setDetailEditMode(false);
    setDetailMenuOpen(false);
  };

  const requestCloseWithDiscardConfirm = (hasUnsavedChanges, onClose) => {
    if (hasUnsavedChanges) {
      confirmDiscardChangesCallbackRef.current = onClose;
      setConfirmDiscardChangesOpen(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscardChanges = () => {
    const fn = confirmDiscardChangesCallbackRef.current;
    confirmDiscardChangesCallbackRef.current = null;
    setConfirmDiscardChangesOpen(false);
    fn?.();
  };

  const closeImportModal = () => {
    setModalImportOpen(false);
    setImportFile(null);
    setImportTitle('');
    setImportDescription('');
    setImportStoryDate('');
    setImportStatus('');
    setImportFamilyMemberId('');
  };

  const hasImportFormDirty = () =>
    importTitle.trim() !== '' ||
    importDescription.trim() !== '' ||
    importStoryDate.trim() !== '' ||
    importFile != null ||
    importFamilyMemberId !== '';

  const closeOnboardingModal = () => {
    setOnboardingOpen(false);
    setEditingFamilyId(null);
    setConfirmDeleteFamilyId(null);
    setNewMemberName('');
    setNewMemberRelationship('');
    setNewMemberAge('');
    setNewMemberBirthday('');
  };

  const hasOnboardingDirty = () =>
    newMemberName.trim() !== '' ||
    newMemberRelationship.trim() !== '' ||
    newMemberAge.trim() !== '' ||
    newMemberBirthday.trim() !== '' ||
    editingFamilyId != null;

  const closeRecordingModal = () => {
    setModalRecordingOpen(false);
    setConfirmDiscardOpen(false);
    setShowResults(false);
    setTranscript('');
    setTranslation('');
    setAudioBlob(null);
    setRecordingDuration(0);
    setRecordTitle('');
    setRecordDescription('');
    setRecordStoryDate('');
    setRecordPhotoFile(null);
    setRecordPhotoPreview(null);
    setRecordingPrompt(null);
    setRecordingSuggestedTitle(null);
    recordingSuggestedTitleRef.current = null;
    setRecordFamilyMemberId('');
    setRecordMode('voice');
  };

  const handleDiscard = () => {
    if (isRecording) {
      setIsRecording(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        mr.stop();
      }
    }
    (async () => {
      try {
        if (draftIdRef.current) await draftClear(draftIdRef.current);
        if (recoverableDraft?.draftId && recoverableDraft.draftId !== draftIdRef.current) {
          await draftClear(recoverableDraft.draftId);
        }
      } catch {}
      draftIdRef.current = null;
      setRecoverableDraft(null);
    })();
    setConfirmDiscardOpen(false);
    closeRecordingModal();
  };

  const handleDeleteRecording = async () => {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    if (!id) return;
    try {
      await deleteRecording(familySlug, id);
      closeModal();
      loadList();
    } catch {
      // could set error state
    }
  };

  const handleSaveDetailChanges = async () => {
    if (!modalRecord) return;
    try {
      const updated = await updateRecording(familySlug, modalRecord.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        storyDate: editStoryDate.trim() || undefined,
        familyMemberId: editFamilyMemberId || undefined,
      });
      setModalRecord(updated);
      setDetailEditMode(false);
      loadList();
    } catch {
      // could set error state
    }
  };

  const handleAddFamilyMemberInOnboarding = async () => {
    const nameTrimmed = newMemberName.trim();
    const relationshipTrimmed = newMemberRelationship.trim();
    if (!nameTrimmed || !relationshipTrimmed) {
      return;
    }
    try {
      const added = await addFamilyMember(familySlug, {
        name: nameTrimmed,
        relationship: relationshipTrimmed,
        age: newMemberAge.trim() || undefined,
        birthday: newMemberBirthday.trim() || undefined,
      });
      setNewMemberName('');
      setNewMemberRelationship('');
      setNewMemberAge('');
      setNewMemberBirthday('');
      loadFamilyMembers();
      setToastMessage(`Added ${added.name}`);
      setTimeout(() => setToastMessage(''), 2500);
    } catch {
      // could set error state
    }
  };

  const startEditFamilyMember = (fm) => {
    setEditingFamilyId(fm.id);
    setNewMemberName(fm.name || '');
    setNewMemberRelationship(fm.relationship || '');
    setNewMemberAge(fm.age != null ? String(fm.age) : '');
    setNewMemberBirthday(fm.birthday || '');
    setAddFamilyModalOpen(true);
  };

  const cancelEditFamilyMember = () => {
    setEditingFamilyId(null);
    setNewMemberName('');
    setNewMemberRelationship('');
    setNewMemberAge('');
    setNewMemberBirthday('');
    setAddFamilyModalOpen(false);
  };

  const handleUpdateFamilyMember = async () => {
    const nameTrimmed = newMemberName.trim();
    const relationshipTrimmed = newMemberRelationship.trim();
    if (!editingFamilyId || !nameTrimmed || !relationshipTrimmed) return;
    try {
      await updateFamilyMember(familySlug, editingFamilyId, {
        name: nameTrimmed,
        relationship: relationshipTrimmed,
        age: newMemberAge.trim() || undefined,
        birthday: newMemberBirthday.trim() || undefined,
      });
      cancelEditFamilyMember();
      loadFamilyMembers();
    } catch {
      // could set error state
    }
  };

  const handleDeleteFamilyMember = async (id) => {
    try {
      await deleteFamilyMember(familySlug, id);
      setConfirmDeleteFamilyId(null);
      if (editingFamilyId === id) cancelEditFamilyMember();
      loadFamilyMembers();
    } catch {
      // could set error state
    }
  };

  const handleImportSave = async () => {
    const titleTrimmed = importTitle.trim();
    if (!titleTrimmed) {
      setImportStatus('Please enter a title.');
      return;
    }
    if (!importFile) {
      setImportStatus('Please choose an audio file.');
      return;
    }
    const id = 'rec-' + Date.now();
    setImportStatus('Saving…');
    try {
      await saveRecording(familySlug, {
        id,
        name: titleTrimmed,
        createdAt: new Date().toISOString(),
        transcript: '',
        translation: '',
        title: titleTrimmed,
        description: importDescription.trim() || undefined,
        storyDate: importStoryDate.trim() || undefined,
        familyMemberId: importFamilyMemberId || undefined,
        audioBlob: importFile,
      });
      setModalImportOpen(false);
      setImportFile(null);
      setImportTitle('');
      setImportDescription('');
      setImportStoryDate('');
      setImportStatus('');
      loadList();
    } catch {
      setImportStatus('Import failed.');
    }
  };

  const handleCancelDetailEdit = () => {
    setEditTitle(modalRecord?.title?.trim() ?? '');
    setEditDescription(modalRecord?.description?.trim() ?? '');
    setEditStoryDate(modalRecord?.storyDate?.trim() ?? '');
    setEditFamilyMemberId(modalRecord?.familyMemberId ?? '');
    setDetailEditMode(false);
  };

  const formatCardTimestamp = (iso) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  };

  const formatStoryDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const PREVIEW_LEN = 56;

  return (
    <div className="app">
      <header className="app-header">
        <h1>🐢 TortoiseAI</h1>
        <div className="app-header-actions">
          <button
            type="button"
            className="btn btn-new"
            onClick={() => {
              setRecordModeModalOpen(true);
            }}
            aria-label="Record story"
          >
            {isKo ? '이야기 녹음하기' : 'Record story'}
          </button>
          <div className="header-more-wrap" ref={moreMenuRef}>
            <button
              type="button"
              className="btn btn-more"
              onClick={() => setMoreMenuOpen((o) => !o)}
              aria-label="More options"
              aria-expanded={moreMenuOpen}
              aria-haspopup="true"
            >
              ⋮
            </button>
            {moreMenuOpen && (
              <div className="header-more-dropdown" role="menu">
                <button
                  type="button"
                  className="header-more-item"
                  role="menuitem"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setModalImportOpen(true);
                    setImportFile(null);
                    setImportTitle('');
                    setImportDescription('');
                    setImportStoryDate('');
                    setImportStatus('');
                    setImportFamilyMemberId('');
                  }}
                >
                  {isKo ? '이야기 가져오기' : 'Import story'}
                </button>
                <button
                  type="button"
                  className="header-more-item"
                  role="menuitem"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setOptionsModalOpen(true);
                  }}
                >
                  {isKo ? '언어 변경' : 'Change language'}
                </button>
                <button
                  type="button"
                  className="header-more-item"
                  role="menuitem"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setOnboardingOpen(true);
                    loadFamilyMembers();
                    setNewMemberName('');
                    setNewMemberRelationship('');
                    setNewMemberAge('');
                    setNewMemberBirthday('');
                    setEditingFamilyId(null);
                    setConfirmDeleteFamilyId(null);
                  }}
                >
                  {isKo ? '가족 관리' : 'Manage family'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {optionsModalOpen && (
        <div
          className="modal modal-recording-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="optionsModalTitle"
          onClick={(e) => e.target === e.currentTarget && setOptionsModalOpen(false)}
        >
          <div className="modal-content modal-import">
            <header className="modal-import-header">
              <h2 id="optionsModalTitle">{isKo ? '언어 설정' : 'Change language'}</h2>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => setOptionsModalOpen(false)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </header>
            <div className="import-form">
              <div className="result-section">
                <label className="result-label" htmlFor="options-spoken-language">
                  {isKo ? '녹음할 언어' : 'Spoken language'}
                </label>
                <select
                  id="options-spoken-language"
                  className="input-field"
                  value={spokenLanguage}
                  onChange={(e) => setSpokenLanguage(e.target.value)}
                  aria-label={isKo ? '녹음할 때 말할 언어' : 'Language you will speak when recording'}
                >
                  <option value="mandarin">{isKo ? '중국어' : 'Mandarin'}</option>
                  <option value="korean">{isKo ? '한국어' : 'Korean'}</option>
                </select>
                <p className="input-hint">
                  {isKo ? '이야기는 받아 적은 후 영어로 번역돼요.' : 'Stories will be transcribed and translated to English.'}
                </p>
              </div>
              <div className="result-section">
                <label className="result-label" htmlFor="options-ui-language">
                  {isKo ? '앱 언어' : 'Interface language'}
                </label>
                <select
                  id="options-ui-language"
                  className="input-field"
                  value={uiLanguage}
                  onChange={(e) => setUiLanguage(e.target.value)}
                  aria-label={isKo ? '앱 화면 언어' : 'Language of the app interface'}
                >
                  <option value="en">English</option>
                  <option value="ko">한국어</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {onboardingOpen && (
        <div
          className="modal modal-recording-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboardingTitle"
          onClick={(e) => e.target === e.currentTarget && requestCloseWithDiscardConfirm(hasOnboardingDirty(), closeOnboardingModal)}
        >
          <div className="modal-content modal-import modal-onboarding">
            <header className="modal-import-header">
              <h2 id="onboardingTitle">{isKo ? '가족 관리' : 'Manage family'}</h2>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => requestCloseWithDiscardConfirm(hasOnboardingDirty(), closeOnboardingModal)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </header>
            <div className="onboarding-list">
              {familyMembers.length === 0 ? (
                <p className="onboarding-list-empty">
                  {isKo ? '아직 추가된 가족이 없어요' : 'No family members yet'}
                </p>
              ) : (
                <ul className="onboarding-family-list" aria-label="Family and story authors">
                  {familyMembers.map((fm) => (
                    <li key={fm.id} className="onboarding-family-item">
                      <span className="onboarding-family-name">{fm.name}</span>
                      <span
                        className="card-author-chip onboarding-family-chip"
                        style={{ backgroundColor: getAuthorColor(fm.id) }}
                      >
                        {fm.relationship || '—'}
                      </span>
                      <div className="onboarding-family-actions">
                        {confirmDeleteFamilyId === fm.id ? (
                          <>
                            <span className="onboarding-delete-prompt">
                              {isKo ? '삭제할까요?' : 'Delete?'}
                            </span>
                            <button
                              type="button"
                              className="btn btn-danger-small"
                              onClick={() => handleDeleteFamilyMember(fm.id)}
                              aria-label="Confirm delete"
                            >
                              {isKo ? '네' : 'Yes'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary-small"
                              onClick={() => setConfirmDeleteFamilyId(null)}
                              aria-label="Cancel delete"
                            >
                              {isKo ? '아니요' : 'No'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-edit-small"
                              onClick={() => startEditFamilyMember(fm)}
                              disabled={editingFamilyId != null && editingFamilyId !== fm.id}
                              aria-label={`Edit ${fm.name}`}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger-small"
                              onClick={() => setConfirmDeleteFamilyId(fm.id)}
                              aria-label={`Delete ${fm.name}`}
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="import-form onboarding-form">
              <div className="modal-detail-actions">
                <button
                  type="button"
                  className="btn btn-save"
                  onClick={() => {
                    setEditingFamilyId(null);
                    setNewMemberName('');
                    setNewMemberRelationship('');
                    setNewMemberAge('');
                    setNewMemberBirthday('');
                    setAddFamilyModalOpen(true);
                  }}
                >
                  Add family member
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => requestCloseWithDiscardConfirm(hasOnboardingDirty(), closeOnboardingModal)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {recordModeModalOpen && (
        <div
          className="modal modal-recording-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recordModeTitle"
          onClick={(e) => e.target === e.currentTarget && setRecordModeModalOpen(false)}
        >
          <div className="modal-content modal-mode">
            <h2 id="recordModeTitle" className="modal-prompt-title">
              {isKo ? '어떻게 녹음할까요?' : 'How would you like to record?'}
            </h2>
            <div className="modal-mode-options">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRecordMode('voice');
                  setRecordingPrompt(null);
                  setRecordingSuggestedTitle(null);
                  recordingSuggestedTitleRef.current = null;
                  setStatus('');
                  setStatusClass('');
                  setShowResults(false);
                  setTranscript('');
                  setTranslation('');
                  setAudioBlob(null);
                  setRecordingDuration(0);
                  setRecordTitle('');
                  setRecordDescription('');
                  setRecordStoryDate('');
                  setRecordFamilyMemberId('');
                  setRecordPhotoFile(null);
                  setRecordPhotoPreview(null);
                  setRecordModeModalOpen(false);
                  setModalRecordingOpen(true);
                }}
              >
                {isKo ? '음성만' : 'Voice-only'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRecordMode('photo');
                  setRecordingPrompt(null);
                  setRecordingSuggestedTitle(null);
                  recordingSuggestedTitleRef.current = null;
                  setStatus('');
                  setStatusClass('');
                  setShowResults(false);
                  setTranscript('');
                  setTranslation('');
                  setAudioBlob(null);
                  setRecordingDuration(0);
                  setRecordTitle('');
                  setRecordDescription('');
                  setRecordStoryDate('');
                  setRecordFamilyMemberId('');
                  setRecordPhotoFile(null);
                  setRecordPhotoPreview(null);
                  setRecordModeModalOpen(false);
                  setModalRecordingOpen(true);
                }}
              >
                {isKo ? '사진 + 음성' : 'Photo + voice'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRecordMode('voice');
                  setRecordingPrompt(null);
                  setRecordingSuggestedTitle(null);
                  recordingSuggestedTitleRef.current = null;
                  setStatus('');
                  setStatusClass('');
                  setShowResults(false);
                  setTranscript('');
                  setTranslation('');
                  setAudioBlob(null);
                  setRecordingDuration(0);
                  setRecordTitle('');
                  setRecordDescription('');
                  setRecordStoryDate('');
                  setRecordFamilyMemberId('');
                  setRecordPhotoFile(null);
                  setRecordPhotoPreview(null);
                  setRecordModeModalOpen(false);
                  setCurrentStoryPrompt(pickRandomPrompt());
                  setPromptModalOpen(true);
                }}
              >
                {isKo ? '이야기 질문' : 'Story prompt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addFamilyModalOpen && (
        <div
          className="modal modal-recording-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="addFamilyModalTitle"
          onClick={(e) => e.target === e.currentTarget && requestCloseWithDiscardConfirm(hasOnboardingDirty(), cancelEditFamilyMember)}
        >
          <div className="modal-content modal-import">
            <header className="modal-import-header">
              <h2 id="addFamilyModalTitle">{editingFamilyId ? 'Edit family member' : 'Add family member'}</h2>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => requestCloseWithDiscardConfirm(hasOnboardingDirty(), cancelEditFamilyMember)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </header>
            <div className="import-form">
              <div className="result-section">
                <label className="result-label" htmlFor="onboarding-name">Name</label>
                <input
                  id="onboarding-name"
                  type="text"
                  className="input-field"
                  placeholder="Their name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                />
              </div>
              <div className="result-section">
                <label className="result-label" htmlFor="onboarding-relationship">Relationship to you</label>
                <input
                  id="onboarding-relationship"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Mother, Grandfather"
                  value={newMemberRelationship}
                  onChange={(e) => setNewMemberRelationship(e.target.value)}
                />
              </div>
              <div className="result-section">
                <label className="result-label" htmlFor="onboarding-age">Age</label>
                <input
                  id="onboarding-age"
                  type="number"
                  className="input-field"
                  placeholder="Age"
                  min={1}
                  max={120}
                  value={newMemberAge}
                  onChange={(e) => setNewMemberAge(e.target.value)}
                />
              </div>
              <div className="result-section">
                <label className="result-label" htmlFor="onboarding-birthday">Birthday</label>
                <input
                  id="onboarding-birthday"
                  type="date"
                  className="input-field"
                  value={newMemberBirthday}
                  onChange={(e) => setNewMemberBirthday(e.target.value)}
                />
              </div>
              <div className="modal-detail-actions">
                <button
                  type="button"
                  className="btn btn-save"
                  onClick={editingFamilyId ? handleUpdateFamilyMember : handleAddFamilyMemberInOnboarding}
                  disabled={!newMemberName.trim() || !newMemberRelationship.trim()}
                >
                  {editingFamilyId ? 'Update' : 'Add'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => requestCloseWithDiscardConfirm(hasOnboardingDirty(), cancelEditFamilyMember)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="toast">
          {toastMessage}
        </div>
      )}

      <section className="saved-section">
        <ul className="saved-list" aria-label="Saved recordings">
          {savedList.length === 0 && <li className="empty-list">No stories yet. Record or import a story to start.</li>}
          {savedList.map((r) => {
            const rawTitle = r.title?.trim() || formatCardTimestamp(r.createdAt);
            const displayTitle = rawTitle.length > 25 ? rawTitle.slice(0, 25) + '...' : rawTitle;
            const text = r.description?.trim() || r.transcript || r.translation || 'No transcript';
            const preview = text.slice(0, PREVIEW_LEN);
            const showEllipsis = text.length > PREVIEW_LEN;
            const cardAuthor = r.familyMemberId ? familyMembers.find((m) => m.id === r.familyMemberId) : null;
            return (
              <li key={r.id}>
                <button type="button" className="saved-card" onClick={() => openModal(r)}>
                  <div className="card-row">
                    <span className="card-timestamp">{displayTitle}</span>
                    {cardAuthor && (
                      <span
                        className="card-author-chip"
                        style={{ backgroundColor: getAuthorColor(cardAuthor.id) }}
                      >
                        {cardAuthor.name}
                      </span>
                    )}
                  </div>
                  {r.storyDate && (
                    <span className="card-story-date">{formatStoryDate(r.storyDate)}</span>
                  )}
                  <span className="card-preview">
                    {preview}
                    {showEllipsis ? '...' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {promptModalOpen && currentStoryPrompt && (
        <div
          className="modal modal-prompt-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="promptModalTitle"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPromptModalOpen(false);
              setCurrentStoryPrompt(null);
            }
          }}
        >
          <div className="modal-content modal-prompt">
            <h2 id="promptModalTitle" className="modal-prompt-title">
              {currentStoryPrompt.promptText}
            </h2>
            <div className="modal-prompt-actions">
              <button
                type="button"
                className="btn btn-prompt-start"
                onClick={() => {
                  setRecordMode('voice');
                  setRecordingPrompt(currentStoryPrompt.promptText);
                  setRecordingSuggestedTitle(currentStoryPrompt.suggestedTitle);
                  recordingSuggestedTitleRef.current = currentStoryPrompt.suggestedTitle;
                  setPromptModalOpen(false);
                  setCurrentStoryPrompt(null);
                  setModalRecordingOpen(true);
                  setStatus('');
                  setStatusClass('');
                  setShowResults(false);
                  setTranscript('');
                  setTranslation('');
                  setAudioBlob(null);
                  setRecordingDuration(0);
                  setRecordTitle('');
                  setRecordDescription('');
                  setRecordStoryDate('');
                  setRecordFamilyMemberId('');
                  setRecordPhotoFile(null);
                  setRecordPhotoPreview(null);
                }}
              >
                Start recording
              </button>
            </div>
          </div>
        </div>
      )}

      {modalRecordingOpen && (
        <div
          className="modal modal-recording-backdrop modal-no-dismiss"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recordModalTitle"
        >
          <div className="modal-recording">
            <header className="modal-recording-header">
              <h2 id="recordModalTitle">
                {recordMode === 'photo' ? 'Record the story behind this photo' : 'Record story'}
              </h2>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => setConfirmDiscardOpen(true)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </header>

            <div className="modal-recording-body">
              {!showResults ? (
                <>
                  {recordMode === 'photo' && (
                    <div className="record-photo-preview">
                      {recordPhotoPreview ? (
                        <img src={recordPhotoPreview} alt="Selected story photo" />
                      ) : (
                        <label className="record-photo-picker">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setRecordPhotoFile(file);
                              setRecordPhotoPreview(file ? URL.createObjectURL(file) : null);
                            }}
                          />
                          <span className="record-photo-picker-label">Add a photo from your gallery</span>
                        </label>
                      )}
                    </div>
                  )}
                  {(recordMode !== 'photo' || recordPhotoPreview) && (
                    <>
                      {recordingPrompt && (
                        <div className="recording-prompt-banner" role="status">
                          {recordingPrompt}
                        </div>
                      )}
                      {typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && (
                        <p className="recording-mobile-tip" role="status">
                          {isKo
                            ? '휴대폰: 녹음 전에 채팅 말풍선·띄워 둔 앱을 닫으면 더 잘 돼요.'
                            : 'On phones: close chat bubbles or floating apps before recording for best results.'}
                        </p>
                      )}
                      <div className="recording-voice-block">
                        <div className="recording-waveform" aria-hidden>
                          <canvas
                            ref={waveformCanvasRef}
                            className="recording-waveform-canvas"
                            width={280}
                            height={56}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="recording-meta">
                          <span className="recording-duration">
                            {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                          </span>
                          {isRecording && <span className="recording-live" />}
                        </div>
                      </div>

                      <div className="recording-transcript-block">
                    <span className="recording-transcript-label">
                      {isKo ? '받아 적기' : 'Transcription'}
                    </span>
                        <div className="recording-transcript">
                          {isRecording && transcript}
                          {showResults && !isRecording && transcript}
                        </div>
                      </div>

                      <div className="recording-actions">
                        {!isRecording && recoverableDraft?.draftId && (
                          <button
                            type="button"
                            className="btn btn-secondary recording-recover"
                            onClick={recoverLastRecording}
                          >
                            {isKo ? '이전 녹음 복구' : 'Recover last recording'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-mic-circle"
                          onClick={startRecording}
                          disabled={isRecording}
                          aria-label="Start recording"
                        >
                          <span className="mic-icon">🎤</span>
                        </button>
                        <button
                          type="button"
                          className="btn-stop-circle"
                          onClick={stopRecording}
                          disabled={!isRecording}
                          aria-label="Stop recording"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                  {status && <p className={`recording-status ${statusClass}`} aria-live="polite">{status}</p>}
                </>
              ) : (
                <div className="recording-results">
                  {recordMode === 'photo' && recordPhotoPreview && (
                    <div className="record-photo-preview record-photo-preview-results">
                      <img src={recordPhotoPreview} alt="Selected story photo" />
                    </div>
                  )}
                  <div className="result-section">
                    <label className="result-label" htmlFor="record-title">Title</label>
                    <input
                      id="record-title"
                      type="text"
                      className="input-field"
                      placeholder="title of your story"
                      value={recordTitle}
                      onChange={(e) => setRecordTitle(e.target.value)}
                      aria-required="true"
                    />
                  </div>
                  <div className="result-section">
                    <label className="result-label" htmlFor="record-date">When did this story happen?</label>
                    <input
                      id="record-date"
                      type="date"
                      className="input-field"
                      value={recordStoryDate}
                      onChange={(e) => setRecordStoryDate(e.target.value)}
                    />
                  </div>
                  <div className="result-section">
                    <label className="result-label" htmlFor="record-desc">Description</label>
                    <textarea
                      id="record-desc"
                      className="input-field input-textarea"
                      placeholder="briefly describe your story"
                      rows={2}
                      value={recordDescription}
                      onChange={(e) => setRecordDescription(e.target.value)}
                    />
                  </div>
                  <div className="result-section">
                    <label className="result-label" htmlFor="record-family">Story author</label>
                    <select
                      id="record-family"
                      className="input-field"
                      value={recordFamilyMemberId}
                      onChange={(e) => setRecordFamilyMemberId(e.target.value)}
                      aria-label="Tag this story with an author"
                    >
                      <option value="">None</option>
                      {familyMembers.map((fm) => (
                        <option key={fm.id} value={fm.id}>{fm.name} ({fm.relationship})</option>
                      ))}
                    </select>
                  </div>
                  <div className="result-section">
                    <span className="result-label">
                      {isKo ? '받아 적기' : 'Transcription'}
                    </span>
                    <p className="result-text">{transcript}</p>
                  </div>
                  <div className="result-section">
                    <span className="result-label">
                      {isKo ? '번역' : 'Translation'}
                    </span>
                    <p className="result-text">{translation}</p>
                  </div>
                  <div className="result-actions result-actions-save-discard">
                    <button type="button" className="btn btn-save" onClick={handleSave}>
                      {isKo ? '저장' : 'Save'}
                    </button>
                    <button type="button" className="btn btn-discard" onClick={() => setConfirmDiscardOpen(true)}>
                      {isKo ? '버리기' : 'Discard'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {confirmDiscardOpen && (
              <div className="confirm-popup-overlay" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-popup">
                  <p className="confirm-popup-text">Discard recording?</p>
                  <div className="confirm-popup-actions">
                    <button type="button" className="btn btn-discard-confirm" onClick={handleDiscard}>
                      Yes, discard
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setConfirmDiscardOpen(false)}>
                      No
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalImportOpen && (
        <div
          className="modal modal-recording-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="importModalTitle"
          onClick={(e) => e.target === e.currentTarget && requestCloseWithDiscardConfirm(hasImportFormDirty(), closeImportModal)}
        >
          <div className="modal-content modal-import">
            <header className="modal-import-header">
              <h2 id="importModalTitle">Import story</h2>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => requestCloseWithDiscardConfirm(hasImportFormDirty(), closeImportModal)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </header>
            <div className="import-form">
              <div className="result-section">
                <label className="result-label" htmlFor="import-audio">Audio file</label>
                <input
                  id="import-audio"
                  type="file"
                  accept="audio/*"
                  className="input-file"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
                {importFile && (
                  <span className="import-file-name">{importFile.name}</span>
                )}
              </div>
              <div className="result-section">
                <label className="result-label" htmlFor="import-title">Title</label>
                <input
                  id="import-title"
                  type="text"
                  className="input-field"
                  placeholder="title of your story"
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                />
              </div>
              <div className="result-section">
                <label className="result-label" htmlFor="import-date">When did this story happen?</label>
                <input
                  id="import-date"
                  type="date"
                  className="input-field"
                  value={importStoryDate}
                  onChange={(e) => setImportStoryDate(e.target.value)}
                />
              </div>
              <div className="result-section">
                <label className="result-label" htmlFor="import-desc">Description</label>
                <textarea
                  id="import-desc"
                  className="input-field input-textarea"
                  placeholder="briefly describe your story"
                  rows={2}
                  value={importDescription}
                  onChange={(e) => setImportDescription(e.target.value)}
                />
              </div>
              <div className="result-section">
                <label className="result-label" htmlFor="import-family">Story author</label>
                <select
                  id="import-family"
                  className="input-field"
                  value={importFamilyMemberId}
                  onChange={(e) => setImportFamilyMemberId(e.target.value)}
                  aria-label="Tag this story with an author"
                >
                  <option value="">None</option>
                  {familyMembers.map((fm) => (
                    <option key={fm.id} value={fm.id}>{fm.name} ({fm.relationship})</option>
                  ))}
                </select>
              </div>
              {importStatus && <p className="import-status">{importStatus}</p>}
              <div className="modal-detail-actions">
                <button type="button" className="btn btn-save" onClick={handleImportSave}>
                  Save
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => requestCloseWithDiscardConfirm(hasImportFormDirty(), closeImportModal)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalRecord && (
        <div
          className="modal modal-recording-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modalTitle"
          onClick={(e) => e.target === e.currentTarget && requestCloseWithDiscardConfirm(detailEditMode, closeModal)}
        >
          <div className="modal-content modal-detail">
            <header className="modal-detail-header">
              <div className="modal-detail-header-title">
                {detailEditMode ? (
                  <input
                    type="text"
                    id="modalTitle"
                    className="modal-detail-title-input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="title of your story"
                  />
                ) : (
                  <h2 id="modalTitle" className="modal-detail-title-view">
                    {modalRecord.title?.trim() || 'Untitled'}
                  </h2>
                )}
              </div>
              <div className="modal-detail-header-actions">
                {!detailEditMode && (
                  <div className="modal-detail-menu-wrap" ref={detailMenuRef}>
                    <button
                      type="button"
                      className="modal-detail-menu-btn"
                      onClick={() => setDetailMenuOpen((o) => !o)}
                      aria-label="More options"
                      aria-expanded={detailMenuOpen}
                      aria-haspopup="true"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
                    </button>
                    {detailMenuOpen && (
                      <div className="modal-detail-menu-dropdown" role="menu">
                        <button
                          type="button"
                          className="modal-detail-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setDetailEditMode(true);
                            setDetailMenuOpen(false);
                          }}
                        >
                          {isKo ? '편집' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="modal-detail-menu-item modal-detail-menu-item-danger"
                          role="menuitem"
                          onClick={() => {
                            setConfirmDeleteId(modalRecord.id);
                            setDetailMenuOpen(false);
                          }}
                        >
                          {isKo ? '삭제' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="modal-close-x"
                  onClick={() => requestCloseWithDiscardConfirm(detailEditMode, closeModal)}
                  aria-label="Close"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </header>
            <div className="modal-detail-body">
              {modalRecord.photoPath && (
                <div className="modal-detail-photo">
                  <img src={getPhotoUrl(familySlug, modalRecord.id)} alt={modalRecord.title?.trim() || 'Story photo'} />
                </div>
              )}
              <section className="modal-detail-story" aria-labelledby="modalTitle">
                {detailEditMode ? (
                  <>
                    <div className="modal-detail-when-row">
                      <label className="modal-detail-when-label" htmlFor="modal-detail-date">
                        {isKo ? '언제 있었던 일인지' : 'When it happened'}
                      </label>
                      <input
                        id="modal-detail-date"
                        type="date"
                        className="input-field input-field-date"
                        value={editStoryDate}
                        onChange={(e) => setEditStoryDate(e.target.value)}
                        aria-label={isKo ? '언제 있었던 일인지' : 'When did this story happen'}
                      />
                    </div>
                    <div className="modal-detail-when-row">
                      <label className="modal-detail-when-label" htmlFor="modal-detail-family">
                        {isKo ? '이야기 주인공' : 'Story author'}
                      </label>
                      <select
                        id="modal-detail-family"
                        className="input-field input-field-date"
                        value={editFamilyMemberId}
                        onChange={(e) => setEditFamilyMemberId(e.target.value)}
                        aria-label={isKo ? '이야기 주인공' : 'Story author'}
                      >
                        <option value="">None</option>
                        {familyMembers.map((fm) => (
                          <option key={fm.id} value={fm.id}>{fm.name} ({fm.relationship})</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      className="modal-detail-description-input"
                      placeholder={isKo ? '이야기에 대해 간단히 적어주세요' : 'briefly describe your story'}
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <p className="modal-detail-when-view">
                      {modalRecord.storyDate
                        ? formatStoryDate(modalRecord.storyDate)
                        : '—'}
                    </p>
                    {modalRecord.familyMemberId && (() => {
                      const fm = familyMembers.find((m) => m.id === modalRecord.familyMemberId);
                      return fm ? (
                        <span
                          className="card-author-chip modal-detail-family-chip"
                          style={{ backgroundColor: getAuthorColor(fm.id) }}
                        >
                          {fm.name}
                        </span>
                      ) : null;
                    })()}
                    <div className="modal-detail-description-view">
                      {modalRecord.description?.trim() || (
                    <span className="modal-detail-description-empty">
                      {isKo ? '설명이 없어요' : 'No description'}
                    </span>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>
            {modalRecord.audioPath ? (
              <div className="modal-audio">
                <audio controls src={getAudioUrl(familySlug, modalRecord.id)} />
                <a
                  className="modal-audio-download"
                  href={getAudioUrl(familySlug, modalRecord.id)}
                  download={`${(modalRecord.title || 'recording').replace(/[\\/:*?"<>|]+/g, '').trim() || 'recording'}.webm`}
                >
                  {isKo ? '녹음 파일 다운로드' : 'Download recording'}
                </a>
                <p className="modal-detail-recorded">
                  {isKo ? '녹음 시간 ' : 'Recorded '}
                  {formatCardTimestamp(modalRecord.createdAt)}
                </p>
              </div>
            ) : (
              <p className="modal-detail-recorded modal-detail-recorded-standalone">
                {isKo ? '녹음 시간 ' : 'Recorded '}
                {formatCardTimestamp(modalRecord.createdAt)}
              </p>
            )}
            <div className="result-block">
              <label>{isKo ? '원문 (중국어)' : 'Transcription (Mandarin)'}</label>
              <p className="text-block">{modalRecord.transcript || '—'}</p>
            </div>
            <div className="result-block">
              <label>{isKo ? '번역 (영어)' : 'Translation (English)'}</label>
              <p className="text-block">{modalRecord.translation || '—'}</p>
            </div>
            {detailEditMode && (
              <div className="modal-detail-actions">
                <button type="button" className="btn btn-save" onClick={handleSaveDetailChanges}>
                  {isKo ? '변경 사항 저장' : 'Save changes'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancelDetailEdit}>
                  {isKo ? '취소' : 'Cancel'}
                </button>
              </div>
            )}
            {confirmDeleteId === modalRecord.id && (
              <div className="confirm-popup-overlay" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-popup">
                  <p className="confirm-popup-text">
                    {isKo ? '이 녹음을 정말 삭제할까요?' : 'Are you sure you want to delete this recording?'}
                  </p>
                  <div className="confirm-popup-actions">
                    <button type="button" className="btn btn-discard-confirm" onClick={handleDeleteRecording}>
                      {isKo ? '네, 삭제할게요' : 'Yes, delete'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                      {isKo ? '아니요' : 'No'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmDiscardChangesOpen && (
        <div
          className="modal modal-recording-backdrop"
          style={{ zIndex: 110 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmDiscardChangesTitle"
          onClick={(e) => e.target === e.currentTarget && setConfirmDiscardChangesOpen(false)}
        >
          <div className="modal-content" style={{ maxWidth: '320px' }} onClick={(e) => e.stopPropagation()}>
            <p id="confirmDiscardChangesTitle" className="confirm-popup-text">
              {isKo ? '지금까지 수정한 내용을 버릴까요?' : 'Are you sure you want to discard your changes?'}
            </p>
            <div className="confirm-popup-actions">
              <button type="button" className="btn btn-discard-confirm" onClick={handleConfirmDiscardChanges}>
                {isKo ? '네, 버릴게요' : 'Yes, discard'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDiscardChangesOpen(false)}>
                {isKo ? '아니요' : 'No'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
