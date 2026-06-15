// ==UserScript==
// @name         学习通题目导出 → 本地刷题
// @namespace    https://github.com/chaoxing-quiz
// @version      1.0.0
// @description  在考试/作业/章节测验页面一键导出 JSON，导入本地刷题软件
// @author       chaoxing-quiz
// @match        *://*.chaoxing.com/*
// @match        *://*.edu.cn/*
// @grant        GM_download
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'cx-quiz-export-panel';

  function isQuizPage() {
    const url = location.href;
    const patterns = [
      /work\/dowork/i,
      /work\/view/i,
      /work\/doHomeWork/i,
      /exam\/preview/i,
      /exam\/dowork/i,
      /exam\/test/i,
      /exam\/look/i,
      /exam\/show/i,
      /mooc2\/work/i,
      /mooc2\/exam/i,
    ];
    return patterns.some((p) => p.test(url));
  }

  function getRoots() {
    const roots = [document];
    document.querySelectorAll('iframe').forEach((frame) => {
      try {
        if (frame.contentDocument) roots.push(frame.contentDocument);
      } catch (_) {
        /* cross-origin */
      }
    });
    return roots;
  }

  function cleanText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, .stuAnswer, .stuanswer, .mark_name').forEach((n) => n.remove());
    let text = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    return text;
  }

  function detectType(node, titleText) {
    const marker =
      node.querySelector('.mark_name, .Zy_TItle, .qtType, .typeName, .questionType')?.textContent || '';
    const combined = `${marker} ${titleText}`;
    if (/多选|不定项/.test(combined)) return 'multiple';
    if (/判断|对错/.test(combined)) return 'judgment';
    if (/填空|完形/.test(combined)) return 'fill';
    if (/简答|论述|名词解释|计算|主观/.test(combined)) return 'essay';
    if (node.querySelector('input[type="checkbox"], .check_answer')) return 'multiple';
    if (node.querySelector('input[type="radio"], .radio_answer')) return 'single';
    return 'single';
  }

  function parseOptions(node) {
    const options = [];
    const seen = new Set();

    const selectors = [
      '.answerBg',
      '.answer_item',
      '.answerList li',
      '.options li',
      '.answer p',
      'ul.ulList li',
      '.stem_answer .clearfix',
    ];

    for (const sel of selectors) {
      const items = node.querySelectorAll(sel);
      if (!items.length) continue;

      items.forEach((item) => {
        const raw = cleanText(item);
        if (!raw || raw.length < 2) return;
        const m = raw.match(/^([A-Ha-hＡ-Ｈａ-ｈ])[\.、．:：\s)\]）]?\s*(.*)$/);
        const key = m ? m[1].toUpperCase().replace(/[Ａ-Ｚ]/g, (c) =>
          String.fromCharCode(c.charCodeAt(0) - 0xfee0)
        ) : String.fromCharCode(65 + options.length);
        const text = m ? m[2].trim() : raw;
        const id = `${key}:${text}`;
        if (!seen.has(id) && text) {
          seen.add(id);
          options.push({ key, text });
        }
      });

      if (options.length) break;
    }

    if (!options.length && detectType(node, '') === 'judgment') {
      return [
        { key: 'A', text: '正确' },
        { key: 'B', text: '错误' },
      ];
    }

    return options;
  }

  function parseAnswer(node, type) {
    const answerSelectors = [
      '.rightAnswerContent',
      '.rightAnswer',
      '.answerCon',
      '.correctAnswer',
      '[class*="rightAnswer"]',
      '.analysis + .rightAnswer',
    ];

    let answerText = '';
    for (const sel of answerSelectors) {
      const el = node.querySelector(sel);
      if (el) {
        answerText = cleanText(el);
        if (answerText) break;
      }
    }

    if (!answerText) {
      const checked = [];
      node.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked').forEach((input) => {
        const label = input.closest('li, .answerBg, .answer_item, p, div');
        const raw = cleanText(label);
        const m = raw.match(/^([A-Ha-h])/);
        if (m) checked.push(m[1].toUpperCase());
      });
      if (checked.length) return [...new Set(checked)];
    }

    if (!answerText) return [];

    answerText = answerText
      .replace(/^(正确答案[:：]?|答案[:：]?|参考答案[:：]?)/i, '')
      .trim();

    if (type === 'judgment') {
      if (/正确|对|√|T|true/i.test(answerText)) return ['A'];
      if (/错误|错|×|F|false/i.test(answerText)) return ['B'];
    }

    if (type === 'fill') {
      return answerText.split(/[;；|｜]/).map((s) => s.trim()).filter(Boolean);
    }

    const letters = answerText.match(/[A-H]/gi);
    if (letters) return [...new Set(letters.map((c) => c.toUpperCase()))];

    return [answerText];
  }

  function parseAnalysis(node) {
    const el = node.querySelector('.analysis, .analysisContent, .jiexi, [class*="analysis"]');
    return cleanText(el).replace(/^(解析[:：]?|试题解析[:：]?)/, '').trim();
  }

  function parseStem(node) {
    const titleEl =
      node.querySelector('h3, .mark_name + div, .Zy_TItle + div, .stem, .questionContent, .qtContent') ||
      node.querySelector('.mark_name, .Zy_TItle');
    let stem = cleanText(titleEl);
    stem = stem.replace(/^(单选题|多选题|判断题|填空题|简答题|不定项选择题)[:：]?\s*/i, '');
    stem = stem.replace(/^\d+[\.、．]\s*/, '');
    return stem;
  }

  function extractFromDocument(doc) {
    const questionNodes = doc.querySelectorAll(
      '.questionLi, .question-item, .questionList li, div[id^="question"], .TiMu'
    );

    const questions = [];
    questionNodes.forEach((node, index) => {
      const stem = parseStem(node);
      if (!stem || stem.length < 2) return;

      const type = detectType(node, stem);
      const options = type === 'fill' || type === 'essay' ? [] : parseOptions(node);
      const answer = parseAnswer(node, type);
      const analysis = parseAnalysis(node);

      const images = [];
      node.querySelectorAll('img').forEach((img) => {
        const src = img.src || img.getAttribute('data-src');
        if (src && !src.includes('icon') && !src.includes('logo')) images.push(src);
      });

      questions.push({
        id: index + 1,
        type,
        stem,
        options,
        answer,
        analysis,
        images,
      });
    });

    return questions;
  }

  function extractAll() {
    const map = new Map();
    getRoots().forEach((root) => {
      extractFromDocument(root).forEach((q) => {
        const key = `${q.type}::${q.stem}`;
        if (!map.has(key)) map.set(key, q);
      });
    });
    return [...map.values()].map((q, i) => ({ ...q, id: i + 1 }));
  }

  function getTitle() {
    const candidates = [
      document.querySelector('.mark_title, .titTxt, .chapter-title, h1, h2'),
      ...getRoots().map((r) => r.querySelector('.mark_title, .titTxt, h1, h2')).filter(Boolean),
    ];
    for (const el of candidates) {
      const t = cleanText(el);
      if (t && t.length > 1 && t.length < 80) return t;
    }
    return document.title.replace(/[-_|].*$/, '').trim() || '学习通题库';
  }

  function buildExport(questions) {
    const withAnswer = questions.filter((q) => q.answer && q.answer.length).length;
    return {
      format: 'chaoxing-quiz-v1',
      title: getTitle(),
      source: 'chaoxing',
      exportedAt: new Date().toISOString(),
      meta: {
        total: questions.length,
        withAnswer,
        pageUrl: location.href,
      },
      questions,
    };
  }

  function downloadJson(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (data.title || '题库').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyJson(data) {
    const text = JSON.stringify(data, null, 2);
    if (typeof GM_setClipboard !== 'undefined') {
      GM_setClipboard(text);
      return true;
    }
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }

  function showToast(msg, ok = true) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '2147483647',
      background: ok ? '#1a7f37' : '#cf222e',
      color: '#fff',
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      boxShadow: '0 4px 12px rgba(0,0,0,.2)',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <style>
        #${PANEL_ID} {
          position: fixed; right: 16px; bottom: 80px; z-index: 2147483646;
          background: #fff; border: 1px solid #d0d7de; border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,.12); width: 220px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          overflow: hidden;
        }
        #${PANEL_ID} .hdr {
          background: linear-gradient(135deg, #0099ff, #0077cc);
          color: #fff; padding: 10px 12px; font-size: 13px; font-weight: 600;
        }
        #${PANEL_ID} .body { padding: 10px 12px; }
        #${PANEL_ID} button {
          width: 100%; margin: 4px 0; padding: 8px 10px; border: none;
          border-radius: 8px; cursor: pointer; font-size: 13px;
        }
        #${PANEL_ID} .primary { background: #0099ff; color: #fff; }
        #${PANEL_ID} .secondary { background: #f6f8fa; color: #24292f; border: 1px solid #d0d7de; }
        #${PANEL_ID} .info { font-size: 11px; color: #656d76; margin-top: 6px; line-height: 1.4; }
        #${PANEL_ID} .count { font-size: 12px; color: #0969da; margin-bottom: 6px; }
      </style>
      <div class="hdr">📚 导出到本地刷题</div>
      <div class="body">
        <div class="count" id="cx-quiz-count">检测中…</div>
        <button class="primary" id="cx-quiz-download">⬇️ 下载 JSON 题库</button>
        <button class="secondary" id="cx-quiz-copy">📋 复制 JSON</button>
        <p class="info">考试中通常没有答案。交卷后打开「查看/成绩」页再导出一次，可带上正确答案。</p>
      </div>
    `;
    document.body.appendChild(panel);

    function refreshCount() {
      const n = extractAll().length;
      const el = document.getElementById('cx-quiz-count');
      if (el) el.textContent = n ? `已识别 ${n} 道题` : '未识别到题目，请确认在答题/查看页';
    }

    document.getElementById('cx-quiz-download').onclick = () => {
      const questions = extractAll();
      if (!questions.length) {
        showToast('未找到题目，请刷新页面重试', false);
        return;
      }
      downloadJson(buildExport(questions));
      showToast(`已导出 ${questions.length} 道题`);
    };

    document.getElementById('cx-quiz-copy').onclick = async () => {
      const questions = extractAll();
      if (!questions.length) {
        showToast('未找到题目', false);
        return;
      }
      const ok = await copyJson(buildExport(questions));
      showToast(ok ? '已复制到剪贴板' : '复制失败，请用下载', ok);
    };

    refreshCount();
    setInterval(refreshCount, 3000);
  }

  function init() {
    if (!isQuizPage()) return;
    setTimeout(createPanel, 1500);
  }

  init();
})();
