(function () {
  'use strict';

  const DB_NAME = 'MandarinRecorderDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'recordings';

  const btnRecord = document.getElementById('btnRecord');
  const btnStop = document.getElementById('btnStop');
  const btnSave = document.getElementById('btnSave');
  const recordStatus = document.getElementById('recordStatus');
  const results = document.getElementById('results');
  const transcriptionEl = document.getElementById('transcription');
  const translationEl = document.getElementById('translation');
  const savedList = document.getElementById('savedList');
  const modal = document.getElementById('modal');
  const modalPlayer = document.getElementById('modalPlayer');
  const modalTitle = document.getElementById('modalTitle');
  const modalMeta = document.getElementById('modalMeta');
  const modalTranscription = document.getElementById('modalTranscription');
  const modalTranslation = document.getElementById('modalTranslation');
  const btnCloseModal = document.getElementById('btnCloseModal');

  let mediaRecorder = null;
  let audioChunks = [];
  let recognition = null;
  let currentTranscript = '';
  let currentAudioBlob = null;

  function setStatus(text, className = '') {
    recordStatus.textContent = text;
    recordStatus.className = 'status' + (className ? ' ' + className : '');
  }

  function getTimestampName() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `Recording ${y}-${m}-${d} ${h}-${min}-${s}`;
  }

  async function translateToEnglish(mandarinText) {
    if (!mandarinText || !mandarinText.trim()) return '';
    const url = 'https://api.mymemory.translated.net/get?' + new URLSearchParams({
      q: mandarinText.trim(),
      langpair: 'zh-CN|en'
    });
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
    return '[Translation failed]';
  }

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('Speech recognition not supported. Use Chrome or Edge for best support.');
      return null;
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'zh-CN';
    rec.onresult = function (event) {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const t = r[0].transcript;
        if (r.isFinal) final += t; else interim += t;
      }
      currentTranscript = (currentTranscript + final).replace(/\s+/g, ' ').trim();
      transcriptionEl.textContent = currentTranscript + (interim ? ' ' + interim : '');
    };
    rec.onerror = function (e) {
      if (e.error !== 'aborted') setStatus('Speech recognition error: ' + e.error);
    };
    return rec;
  }

  async function startRecording() {
    currentTranscript = '';
    currentAudioBlob = null;
    audioChunks = [];
    transcriptionEl.textContent = '';
    translationEl.textContent = '';
    results.hidden = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (e) {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = function () {
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();

      recognition = initSpeechRecognition();
      if (recognition) {
        recognition.start();
        transcriptionEl.textContent = '…';
      }

      btnRecord.disabled = true;
      btnStop.disabled = false;
      setStatus('Recording… Speak in Mandarin.', 'recording');
    } catch (err) {
      setStatus('Microphone access denied or not available.');
    }
  }

  async function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

    btnStop.disabled = true;
    setStatus('Processing…', 'processing');

    if (recognition) {
      const rec = recognition;
      recognition = null;
      await new Promise(function (resolve) {
        var settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          resolve();
        }
        var timer = setTimeout(finish, 600);
        rec.addEventListener('end', function onEnd() {
          clearTimeout(timer);
          rec.removeEventListener('end', onEnd);
          finish();
        });
        try {
          rec.stop();
        } catch (e) {
          clearTimeout(timer);
          finish();
        }
      });
    }

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        await new Promise(function (r) {
          requestAnimationFrame(function () {
            requestAnimationFrame(r);
          });
        });
        const transcript = (currentTranscript || transcriptionEl.textContent || '').replace(/^…\s*/, '').trim();
        transcriptionEl.textContent = transcript || '(No speech detected)';

        if (transcript) {
          try {
            const translated = await translateToEnglish(transcript);
            translationEl.textContent = translated;
          } catch (e) {
            translationEl.textContent = '[Translation failed]';
          }
        } else {
          translationEl.textContent = '';
        }

        currentAudioBlob = audioChunks.length ? new Blob(audioChunks, { type: 'audio/webm' }) : null;
        results.hidden = false;
        btnRecord.disabled = false;
        setStatus('Done. Save or record again.');
        resolve();
      };
      mediaRecorder.stop();
    });
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async function saveRecording() {
    const name = getTimestampName();
    const transcript = transcriptionEl.textContent.trim() || '';
    const translation = translationEl.textContent.trim() || '';
    if (!currentAudioBlob && !transcript) {
      setStatus('Nothing to save. Record first.');
      return;
    }

    const id = 'rec-' + Date.now();
    const record = {
      id,
      name,
      createdAt: new Date().toISOString(),
      transcript,
      translation,
      audio: currentAudioBlob
    };

    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      setStatus('Saved as “‘ + name + '”.');
      renderSavedList();
    } catch (e) {
      setStatus('Save failed.');
    }
  }

  async function getAllRecordings() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function renderSavedList() {
    const list = await getAllRecordings();
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (list.length === 0) {
      savedList.innerHTML = '<li class="empty-list">No saved recordings yet.</li>';
      return;
    }

    savedList.innerHTML = list.map((r) => {
      const date = new Date(r.createdAt);
      const dateStr = date.toLocaleString();
      const preview = (r.translation || r.transcript || 'No text').slice(0, 50);
      return (
        '<li><button type="button" data-id="' +
        r.id +
        '"><span class="item-name">' +
        escapeHtml(r.name) +
        '</span><span class="item-preview">' +
        escapeHtml(preview) +
        (preview.length >= 50 ? '…' : '') +
        ' · ' +
        dateStr +
        '</span></button></li>'
      );
    }).join('');

    savedList.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => openRecording(btn.dataset.id));
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function openRecording(id) {
    const db = await openDB();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (!record) return;

    modalTitle.textContent = record.name;
    modalMeta.textContent = new Date(record.createdAt).toLocaleString();
    modalTranscription.textContent = record.transcript || '—';
    modalTranslation.textContent = record.translation || '—';

    if (record.audio) {
      modalPlayer.src = URL.createObjectURL(record.audio);
      modalPlayer.hidden = false;
    } else {
      modalPlayer.src = '';
      modalPlayer.hidden = true;
    }

    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
    if (modalPlayer.src) URL.revokeObjectURL(modalPlayer.src);
    modalPlayer.src = '';
  }

  btnRecord.addEventListener('click', startRecording);
  btnStop.addEventListener('click', stopRecording);
  btnSave.addEventListener('click', saveRecording);
  btnCloseModal.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  renderSavedList();
})();
