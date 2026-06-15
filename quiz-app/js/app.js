const state = {
  currentBank: null,
  order: [],
  currentIndex: 0,
  answers: {},
  submitted: false,
  reviewMode: false,
  lastResult: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showView(name) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  $(`#view-${name}`)?.classList.add('active');
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderBanks() {
  const banks = Storage.loadBanks();
  const list = $('#bank-list');
  const empty = $('#bank-empty');
  $('#bank-count').textContent = `${banks.length} 套`;

  if (!banks.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = banks
    .map((bank) => {
      const total = bank.questions?.length || 0;
      const withAns = bank.questions?.filter((q) => q.answer?.length).length || 0;
      const ansHint =
        withAns < total
          ? `<span style="color:var(--orange)"> · ${withAns}/${total} 题有答案</span>`
          : ' · 答案齐全';
      return `
        <div class="bank-item" data-id="${bank.id}">
          <div class="bank-info">
            <h4>${escapeHtml(bank.title)}</h4>
            <div class="bank-meta">${total} 题${ansHint} · 导入于 ${formatDate(bank.importedAt)}</div>
          </div>
          <div class="bank-actions">
            <button class="btn primary" data-action="start" data-id="${bank.id}">刷题</button>
            <button class="btn ghost" data-action="word" data-id="${bank.id}">Word</button>
            <button class="btn ghost" data-action="anki" data-id="${bank.id}">Anki</button>
            <button class="btn ghost" data-action="json" data-id="${bank.id}">JSON</button>
            <button class="btn danger" data-action="delete" data-id="${bank.id}">删</button>
          </div>
        </div>`;
    })
    .join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function startPractice(bankId) {
  const bank = Storage.getBank(bankId);
  if (!bank) return;

  state.currentBank = bank;
  state.order = bank.questions.map((_, i) => i);
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = false;
  state.reviewMode = false;
  state.lastResult = null;

  $('#practice-title').textContent = bank.title;
  $('#nav-practice').disabled = false;
  $('#nav-result').disabled = true;
  $('#review-list').classList.add('hidden');

  showView('practice');
  renderQuestion();
  renderAnswerSheet();
}

function getCurrentQuestion() {
  const idx = state.order[state.currentIndex];
  return state.currentBank.questions[idx];
}

function getUserAnswer(q) {
  const idx = state.order[state.currentIndex];
  return state.answers[idx] || (q.type === 'fill' ? [''] : []);
}

function setUserAnswer(q, value) {
  const idx = state.order[state.currentIndex];
  state.answers[idx] = value;
  renderAnswerSheet();
}

function toggleOption(q, key) {
  if (state.submitted) return;
  let current = [...getUserAnswer(q)];

  if (q.type === 'multiple') {
    if (current.includes(key)) current = current.filter((k) => k !== key);
    else current.push(key);
    current.sort();
  } else {
    current = [key];
  }

  setUserAnswer(q, current);
  renderQuestion();
}

function renderQuestion() {
  const q = getCurrentQuestion();
  const total = state.order.length;
  const userAns = getUserAnswer(q);

  $('#practice-progress').textContent = `第 ${state.currentIndex + 1} / ${total} 题`;
  $('#q-type').textContent = Parser.TYPE_LABELS[q.type] || '题目';
  $('#q-index').textContent = `${state.currentIndex + 1}`;
  $('#q-stem').textContent = q.stem;

  const imgBox = $('#q-images');
  imgBox.innerHTML = (q.images || [])
    .map((src) => `<img src="${escapeHtml(src)}" alt="题目图片" loading="lazy" />`)
    .join('');

  const optBox = $('#q-options');
  const fillBox = $('#q-fill');

  if (q.type === 'fill') {
    optBox.innerHTML = '';
    fillBox.classList.remove('hidden');
    const input = $('#fill-input');
    input.value = userAns[0] || '';
    input.oninput = () => setUserAnswer(q, [input.value]);
    input.disabled = state.submitted;
  } else if (q.type === 'essay') {
    fillBox.classList.remove('hidden');
    optBox.innerHTML = '<p class="muted">主观题不计入自动评分，请自行对照答案。</p>';
    const input = $('#fill-input');
    input.placeholder = '可记录你的作答要点';
    input.value = userAns[0] || '';
    input.oninput = () => setUserAnswer(q, [input.value]);
  } else {
    fillBox.classList.add('hidden');
    optBox.innerHTML = (q.options || [])
      .map((opt) => {
        const selected = userAns.includes(opt.key);
        let cls = 'option';
        if (selected) cls += ' selected';

        if (state.submitted && q.answer?.length) {
          const isCorrect = q.answer.includes(opt.key);
          if (isCorrect) cls += ' correct';
          else if (selected && !isCorrect) cls += ' wrong';
        }

        return `
          <div class="${cls}" data-key="${opt.key}">
            <span class="key">${opt.key}</span>
            <span class="text">${escapeHtml(opt.text)}</span>
          </div>`;
      })
      .join('');

    optBox.querySelectorAll('.option').forEach((el) => {
      el.onclick = () => toggleOption(q, el.dataset.key);
    });
  }

  $('#btn-prev').disabled = state.currentIndex === 0;
  const isLast = state.currentIndex === total - 1;
  $('#btn-next').classList.toggle('hidden', isLast && !state.submitted);
  $('#btn-submit').classList.toggle('hidden', state.submitted || !isLast);
  $('#btn-next').textContent = isLast ? '下一题' : '下一题';

  if (state.submitted && q.answer?.length) {
    showInlineFeedback(q, userAns);
  }
}

function showInlineFeedback(q, userAns) {
  const result = Parser.compareAnswers(userAns, q.answer, q.type);
  if (result === null) return;

  const existing = document.getElementById('inline-feedback');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'inline-feedback';
  div.className = 'card';
  div.style.marginTop = '12px';
  div.style.padding = '12px';
  div.style.background = result ? '#f6ffed' : '#fff2f0';
  div.style.borderColor = result ? '#b7eb8f' : '#ffa39e';
  div.innerHTML = `
    <strong>${result ? '✓ 回答正确' : '✗ 回答错误'}</strong>
    <p class="muted" style="margin-top:6px">正确答案：${escapeHtml(Parser.formatAnswerDisplay(q.answer, q.type, q.options))}</p>
    ${q.analysis ? `<p class="ri-analysis">${escapeHtml(q.analysis)}</p>` : ''}`;
  $('#question-card').appendChild(div);
}

function renderAnswerSheet() {
  const sheet = $('#answer-sheet');
  sheet.innerHTML = state.order
    .map((qIdx, i) => {
      const answered = state.answers[qIdx]?.length && state.answers[qIdx][0] !== '';
      const cls = ['sheet-item', answered ? 'answered' : '', i === state.currentIndex ? 'current' : '']
        .filter(Boolean)
        .join(' ');
      return `<button class="${cls}" data-index="${i}">${i + 1}</button>`;
    })
    .join('');

  sheet.querySelectorAll('.sheet-item').forEach((btn) => {
    btn.onclick = () => {
      state.currentIndex = Number(btn.dataset.index);
      renderQuestion();
      renderAnswerSheet();
    };
  });
}

function submitExam() {
  const questions = state.currentBank.questions;
  let scorable = 0;
  let correct = 0;
  const details = [];

  state.order.forEach((qIdx) => {
    const q = questions[qIdx];
    const userAns = state.answers[qIdx] || [];
    const result = Parser.compareAnswers(userAns, q.answer, q.type);

    if (result !== null) {
      scorable += 1;
      if (result) correct += 1;
    }

    details.push({ q, userAns, result, qIdx });
  });

  const score = scorable ? Math.round((correct / scorable) * 100) : 0;

  state.submitted = true;
  state.lastResult = { score, correct, scorable, total: questions.length, details };

  $('#score-num').textContent = score;
  $('#result-title').textContent = state.currentBank.title;
  $('#result-summary').textContent =
    scorable > 0
      ? `共 ${questions.length} 题，客观题 ${scorable} 道，答对 ${correct} 道`
      : `共 ${questions.length} 题（暂无标准答案，无法自动评分）`;

  $('#nav-result').disabled = false;
  showView('result');
}

function renderReview() {
  const list = $('#review-list');
  const { details } = state.lastResult;

  list.innerHTML = details
    .map(({ q, userAns, result }, i) => {
      const cls = result === true ? 'correct' : result === false ? 'wrong' : '';
      const status =
        result === true ? '✓ 正确' : result === false ? '✗ 错误' : '— 未评分';
      return `
        <div class="card review-item ${cls}">
          <div class="ri-stem">${i + 1}. [${Parser.TYPE_LABELS[q.type]}] ${escapeHtml(q.stem)}</div>
          <div class="ri-ans">你的答案：${escapeHtml(Parser.formatAnswerDisplay(userAns, q.type, q.options))}</div>
          <div class="ri-ans">正确答案：${escapeHtml(Parser.formatAnswerDisplay(q.answer, q.type, q.options))}</div>
          <div class="ri-ans">${status}</div>
          ${q.analysis ? `<div class="ri-analysis">${escapeHtml(q.analysis)}</div>` : ''}
        </div>`;
    })
    .join('');

  list.classList.remove('hidden');
}

function shuffleOrder() {
  for (let i = state.order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  }
  state.currentIndex = 0;
  renderQuestion();
  renderAnswerSheet();
}

function retake() {
  state.answers = {};
  state.submitted = false;
  state.currentIndex = 0;
  state.reviewMode = false;
  $('#review-list').classList.add('hidden');
  document.getElementById('inline-feedback')?.remove();
  showView('practice');
  renderQuestion();
  renderAnswerSheet();
}

function readBankFile(file) {
  const isDocx = /\.docx?$/i.test(file.name);
  if (isDocx) {
    return DocxParser.parseFile(file).catch((e) => {
      throw new Error(`${file.name}: ${e.message}`);
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(Parser.parseFileContent(reader.result));
      } catch (e) {
        reject(new Error(`${file.name}: ${e.message}`));
      }
    };
    reader.onerror = () => reject(new Error(`${file.name}: 读取失败`));
    reader.readAsText(file, 'UTF-8');
  });
}

function importBanks(banks) {
  if (banks.length === 1) {
    const bank = banks[0];
    Storage.addBank({ ...bank, id: `bank_${Date.now()}` });
    renderBanks();
    alert(`导入成功：${bank.title}（${bank.questions.length} 题，${bank.meta.withAnswer} 题有答案）`);
    return;
  }

  const merged = Parser.mergeBanks(banks, banks[0].title + '（合并版）');
  Storage.addBank({ ...merged, id: `bank_${Date.now()}` });
  renderBanks();
  const dup = merged.meta.mergedFrom - merged.questions.length;
  alert(
    `合并成功：${merged.questions.length} 道不重复题\n` +
      `（来自 ${banks.length} 个文件共 ${merged.meta.mergedFrom} 道，去重 ${dup} 道）\n` +
      `其中 ${merged.meta.withAnswer} 道有答案`
  );
}

function handleImportFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  Promise.all(files.map(readBankFile))
    .then(importBanks)
    .catch((e) => alert('导入失败：' + e.message));
}

function mergeAllBanks() {
  const banks = Storage.loadBanks();
  if (banks.length < 2) {
    alert('至少需要 2 套题库才能合并');
    return;
  }
  const title = prompt('合并后的题库名称', banks[0].title + '（合并版）');
  if (title === null) return;

  const merged = Parser.mergeBanks(banks, title || banks[0].title + '（合并版）');
  Storage.addBank({ ...merged, id: `bank_${Date.now()}` });
  renderBanks();
  const dup = merged.meta.mergedFrom - merged.questions.length;
  alert(
    `合并成功：${merged.questions.length} 道不重复题\n` +
      `（共 ${banks.length} 套、${merged.meta.mergedFrom} 道，去重 ${dup} 道）`
  );
}

function handleImport(file) {
  handleImportFiles([file]);
}

function exportBank(bankId, format) {
  const bank = Storage.getBank(bankId);
  if (!bank) return;
  if (format === 'word') Exporter.toWord(bank);
  else if (format === 'anki') Exporter.toAnki(bank);
  else if (format === 'json') Exporter.toJson(bank);
}

function bindEvents() {
  $('#import-file').addEventListener('change', (e) => {
    if (e.target.files?.length) handleImportFiles(e.target.files);
    e.target.value = '';
  });

  $('#import-docx').addEventListener('change', (e) => {
    if (e.target.files?.length) handleImportFiles(e.target.files);
    e.target.value = '';
  });

  $('#btn-merge-all').addEventListener('click', mergeAllBanks);

  $('#bank-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'start') startPractice(id);
    if (btn.dataset.action === 'word') exportBank(id, 'word');
    if (btn.dataset.action === 'anki') exportBank(id, 'anki');
    if (btn.dataset.action === 'json') exportBank(id, 'json');
    if (btn.dataset.action === 'delete') {
      if (confirm('确定删除这套题库？')) {
        Storage.removeBank(id);
        renderBanks();
      }
    }
  });

  $('#btn-prev').onclick = () => {
    if (state.currentIndex > 0) {
      state.currentIndex -= 1;
      document.getElementById('inline-feedback')?.remove();
      renderQuestion();
      renderAnswerSheet();
    }
  };

  $('#btn-next').onclick = () => {
    if (state.currentIndex < state.order.length - 1) {
      state.currentIndex += 1;
      document.getElementById('inline-feedback')?.remove();
      renderQuestion();
      renderAnswerSheet();
    }
  };

  $('#btn-submit').onclick = () => {
    if (confirm('确认交卷？')) submitExam();
  };

  $('#btn-shuffle').onclick = shuffleOrder;
  $('#btn-export-word').onclick = () => {
    if (state.currentBank) Exporter.toWord(state.currentBank);
  };
  $('#btn-export-anki').onclick = () => {
    if (state.currentBank) Exporter.toAnki(state.currentBank);
  };
  $('#btn-exit').onclick = () => showView('banks');
  $('#btn-review').onclick = () => {
    showView('result');
    renderReview();
  };
  $('#btn-retake').onclick = retake;
  $('#btn-back-banks').onclick = () => showView('banks');

  $$('.nav-btn').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;
      showView(btn.dataset.view);
      if (btn.dataset.view === 'practice') renderQuestion();
      if (btn.dataset.view === 'result' && state.reviewMode) renderReview();
    };
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  renderBanks();
});
