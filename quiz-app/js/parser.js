const TYPE_LABELS = {
  single: '单选题',
  multiple: '多选题',
  judgment: '判断题',
  fill: '填空题',
  essay: '简答题',
};

function normalizeType(type) {
  const t = String(type || '').toLowerCase();
  if (['single', 'radio', '0', 'danxuan'].includes(t)) return 'single';
  if (['multiple', 'checkbox', '1', 'duoxuan'].includes(t)) return 'multiple';
  if (['judgment', 'truefalse', '判断', '2'].includes(t)) return 'judgment';
  if (['fill', 'blank', '3'].includes(t)) return 'fill';
  if (['essay', 'subjective', '4'].includes(t)) return 'essay';
  if (/多选/.test(t)) return 'multiple';
  if (/判断/.test(t)) return 'judgment';
  if (/填空/.test(t)) return 'fill';
  if (/简答|论述/.test(t)) return 'essay';
  return 'single';
}

function normalizeAnswer(answer, type) {
  if (!answer) return [];
  if (Array.isArray(answer)) {
    return answer.map((a) => String(a).trim()).filter(Boolean);
  }
  const s = String(answer).trim();
  if (type === 'fill') {
    return s.split(/[;；|｜]/).map((x) => x.trim()).filter(Boolean);
  }
  const letters = s.match(/[A-H]/gi);
  if (letters) return [...new Set(letters.map((c) => c.toUpperCase()))];
  return [s];
}

function normalizeQuestion(q, index) {
  const type = normalizeType(q.type);
  const options = Array.isArray(q.options)
    ? q.options.map((o, i) => {
        if (typeof o === 'string') {
          const m = o.match(/^([A-H])[\.、．:：\s]?\s*(.*)$/i);
          return m
            ? { key: m[1].toUpperCase(), text: m[2].trim() }
            : { key: String.fromCharCode(65 + i), text: o };
        }
        return {
          key: (o.key || o.label || String.fromCharCode(65 + i)).toUpperCase(),
          text: o.text || o.content || o.value || '',
        };
      })
    : [];

  return {
    id: q.id ?? index + 1,
    type,
    stem: String(q.stem || q.title || q.question || '').trim(),
    options,
    answer: normalizeAnswer(q.answer || q.answers || q.correct, type),
    analysis: String(q.analysis || q.explain || q.jiexi || '').trim(),
    images: Array.isArray(q.images) ? q.images : [],
  };
}

const Parser = {
  TYPE_LABELS,

  parseFileContent(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('JSON 格式无效，请确认导出的是 .json 文件');
    }
    return this.normalizeBank(data);
  },

  normalizeBank(data) {
    if (!data) throw new Error('文件内容为空');

    let questions = [];
    if (Array.isArray(data)) {
      questions = data;
    } else if (Array.isArray(data.questions)) {
      questions = data.questions;
    } else if (Array.isArray(data.data)) {
      questions = data.data;
    } else {
      throw new Error('未找到题目列表（需要 questions 数组）');
    }

    const normalized = questions
      .map((q, i) => normalizeQuestion(q, i))
      .filter((q) => q.stem);

    if (!normalized.length) throw new Error('没有有效题目');

    const withAnswer = normalized.filter((q) => q.answer.length).length;

    return {
      title: data.title || data.name || '未命名题库',
      source: data.source || 'import',
      questions: normalized,
      meta: {
        total: normalized.length,
        withAnswer,
        ...(data.meta || {}),
      },
    };
  },

  compareAnswers(userAns, correctAns, type) {
    const norm = (arr) =>
      [...new Set(arr.map((s) => String(s).trim().toLowerCase()))].sort().join('|');

    if (type === 'fill') {
      const u = userAns.map((s) => s.trim());
      const c = correctAns.map((s) => s.trim());
      if (!c.length) return null;
      if (u.length !== c.length) return false;
      return u.every((v, i) => v === c[i] || c[i].includes(v) || v.includes(c[i]));
    }

    if (type === 'essay') return null;

    if (!correctAns.length) return null;
    return norm(userAns) === norm(correctAns);
  },

  formatAnswerDisplay(answer, type, options) {
    if (!answer || !answer.length) return '（未设置答案）';
    if (type === 'judgment') {
      const map = { A: '正确', B: '错误' };
      return answer.map((k) => map[k] || k).join('、');
    }
    if (type === 'fill' || type === 'essay') return answer.join('；');
    return answer
      .map((k) => {
        const opt = options.find((o) => o.key === k);
        return opt ? `${k}. ${opt.text}` : k;
      })
      .join('；');
  },
};
