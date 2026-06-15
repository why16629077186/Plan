const Exporter = {
  download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  safeName(title) {
    return (title || '题库').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
  },

  buildQuestionHtml(q, index) {
    const type = Parser.TYPE_LABELS[q.type] || '题目';
    const options =
      q.options?.length > 0
        ? `<ul>${q.options.map((o) => `<li><b>${o.key}.</b> ${escapeExportHtml(o.text)}</li>`).join('')}</ul>`
        : '';
    const images =
      q.images?.length > 0
        ? q.images.map((src) => `<p><img src="${src}" style="max-width:480px" /></p>`).join('')
        : '';
    const answer = Parser.formatAnswerDisplay(q.answer, q.type, q.options);
    const analysis = q.analysis
      ? `<p style="color:#555;margin-top:8px"><b>解析：</b>${escapeExportHtml(q.analysis)}</p>`
      : '';

    return `
      <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #ddd">
        <p><b>${index}. [${type}]</b> ${escapeExportHtml(q.stem)}</p>
        ${images}
        ${options}
        <p style="color:#0969da"><b>答案：</b>${escapeExportHtml(answer)}</p>
        ${analysis}
      </div>`;
  },

  toWord(bank) {
    const title = bank.title || '题库';
    const body = bank.questions.map((q, i) => this.buildQuestionHtml(q, i + 1)).join('');
    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escapeExportHtml(title)}</title></head>
<body>
  <h1 style="text-align:center;color:#0077cc">${escapeExportHtml(title)}</h1>
  <p style="text-align:center;color:#666">共 ${bank.questions.length} 题 · 导出时间 ${new Date().toLocaleString('zh-CN')}</p>
  <hr />
  ${body}
</body>
</html>`;
    this.download(`${this.safeName(title)}.doc`, '\ufeff' + html, 'application/msword');
  },

  buildAnkiFront(q, index) {
    const type = Parser.TYPE_LABELS[q.type] || '';
    const lines = [`<b>${index}. [${type}]</b> ${escapeExportHtml(q.stem)}`];
    if (q.options?.length) {
      q.options.forEach((o) => lines.push(`${o.key}. ${escapeExportHtml(o.text)}`));
    }
    if (q.images?.length) {
      q.images.forEach((src) => lines.push(`<img src="${src}" />`));
    }
    return lines.join('<br>');
  },

  buildAnkiBack(q) {
    const answer = Parser.formatAnswerDisplay(q.answer, q.type, q.options);
    const parts = [`<b>答案：</b>${escapeExportHtml(answer)}`];
    if (q.analysis) parts.push(`<b>解析：</b>${escapeExportHtml(q.analysis)}`);
    return parts.join('<br><br>');
  },

  toAnki(bank) {
    const deck = this.safeName(bank.title);
    const tag = '学习通';
    const rows = bank.questions.map((q, i) => {
      const front = this.buildAnkiFront(q, i + 1);
      const back = this.buildAnkiBack(q);
      return `${front}\t${back}\t${tag}`;
    });

    const content = [
      '#separator:tab',
      '#html:true',
      '#deck:' + deck,
      '#notetype:Basic',
      '',
      ...rows,
    ].join('\n');

    this.download(`${deck}_anki.txt`, '\ufeff' + content, 'text/plain;charset=utf-8');
  },

  toJson(bank) {
    const data = {
      format: 'chaoxing-quiz-v1',
      title: bank.title,
      source: bank.source || 'export',
      exportedAt: new Date().toISOString(),
      meta: {
        total: bank.questions.length,
        withAnswer: bank.questions.filter((q) => q.answer?.length).length,
      },
      questions: bank.questions,
    };
    this.download(
      `${this.safeName(bank.title)}.json`,
      JSON.stringify(data, null, 2),
      'application/json'
    );
  },
};

function escapeExportHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
