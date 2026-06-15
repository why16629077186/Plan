const DocxParser = {
  async extractText(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 未加载，请检查网络后刷新页面');
    }
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) throw new Error('不是有效的 Word 文档');

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = [...doc.getElementsByTagName('w:p')];
    const lines = paragraphs
      .map((p) => {
        const texts = [...p.getElementsByTagName('w:t')].map((t) => t.textContent || '');
        return texts.join('').trim();
      })
      .filter(Boolean);

    return lines.join('\n');
  },

  parseText(text, title) {
    const normalized = text
      .replace(/\r/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

    const blocks = this.splitBlocks(normalized);
    const questions = [];

    blocks.forEach((block) => {
      const q = this.parseBlock(block);
      if (q && q.stem) questions.push(q);
    });

    if (!questions.length) {
      throw new Error('未能从 Word 中识别题目，请确认文档含题号、选项和答案');
    }

    return Parser.normalizeBank({
      title: title || 'Word 导入题库',
      source: 'docx',
      questions,
    });
  },

  splitBlocks(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const blocks = [];
    let current = [];

    const isNewQuestion = (line) =>
      /^(?:第\s*)?\d+\s*[\.、．:：\)]\s*/.test(line) ||
      /^(?:第\s*)?\d+\s*题/.test(line) ||
      /^\[\s*(单选|多选|判断|填空|简答)/.test(line);

    lines.forEach((line) => {
      if (isNewQuestion(line) && current.length) {
        blocks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    });
    if (current.length) blocks.push(current.join('\n'));

    if (blocks.length <= 1 && lines.length > 3) {
      return [text];
    }
    return blocks;
  },

  parseBlock(block) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;

    let type = 'single';
    let stem = '';
    const options = [];
    let answer = [];
    let analysis = '';
    const stemLines = [];

    const typeFromLine = (line) => {
      if (/多选|不定项/.test(line)) return 'multiple';
      if (/判断|对错/.test(line)) return 'judgment';
      if (/填空|完形/.test(line)) return 'fill';
      if (/简答|论述|名词解释|计算|主观/.test(line)) return 'essay';
      return null;
    };

    lines.forEach((line) => {
      const ansMatch = line.match(/^(?:正确)?答案\s*[:：]\s*(.+)$/i);
      if (ansMatch) {
        answer = this.parseAnswerText(ansMatch[1], type);
        return;
      }

      const analysisMatch = line.match(/^(?:试题)?解析\s*[:：]\s*(.+)$/i);
      if (analysisMatch) {
        analysis = analysisMatch[1].trim();
        return;
      }

      const optMatch = line.match(/^([A-Ha-h])[\.、．:：\)\]）]\s*(.+)$/);
      if (optMatch) {
        options.push({ key: optMatch[1].toUpperCase(), text: optMatch[2].trim() });
        return;
      }

      const detected = typeFromLine(line);
      if (detected) type = detected;

      const qMatch = line.match(/^(?:第\s*)?(\d+)\s*[\.、．:：\)]\s*(?:\[(.+?)\]\s*)?(.+)$/);
      if (qMatch) {
        if (qMatch[2]) {
          const t = typeFromLine(qMatch[2]);
          if (t) type = t;
        }
        stemLines.push(qMatch[3].trim());
        return;
      }

      const qMatch2 = line.match(/^(?:第\s*)?(\d+)\s*题\s*[:：]?\s*(.+)$/);
      if (qMatch2) {
        stemLines.push(qMatch2[2].trim());
        return;
      }

      if (/^\[(单选|多选|判断|填空|简答)/.test(line)) {
        const t = typeFromLine(line);
        if (t) type = t;
        stemLines.push(line.replace(/^\[.+?\]\s*/, ''));
        return;
      }

      if (!stem && !options.length && !/答案|解析/.test(line)) {
        stemLines.push(line);
      } else if (options.length || stem) {
        if (/答案|解析/.test(line)) return;
        stemLines.push(line);
      }
    });

    stem = stemLines
      .join(' ')
      .replace(/^(单选题|多选题|判断题|填空题|简答题|不定项选择题)[:：]?\s*/i, '')
      .trim();

    if (type === 'judgment' && !options.length) {
      options.push({ key: 'A', text: '正确' }, { key: 'B', text: '错误' });
    }

    if (!answer.length) {
      const inline = block.match(/(?:正确)?答案\s*[:：]\s*([A-H]+|正确|错误|对|错|[\u4e00-\u9fa5；;、\w\s]+)/i);
      if (inline) answer = this.parseAnswerText(inline[1], type);
    }

    if (!analysis) {
      const inline = block.match(/(?:试题)?解析\s*[:：]\s*(.+)$/im);
      if (inline) analysis = inline[1].trim();
    }

    return { type, stem, options, answer, analysis, images: [] };
  },

  parseAnswerText(text, type) {
    const s = String(text).trim();
    if (!s) return [];

    if (type === 'judgment') {
      if (/正确|对|√|T/i.test(s)) return ['A'];
      if (/错误|错|×|F/i.test(s)) return ['B'];
    }

    if (type === 'fill' || type === 'essay') {
      return s.split(/[;；|｜]/).map((x) => x.trim()).filter(Boolean);
    }

    const letters = s.match(/[A-H]/gi);
    if (letters) return [...new Set(letters.map((c) => c.toUpperCase()))];

    return [s];
  },

  async parseFile(file) {
    const text = await this.extractText(file);
    const title = file.name.replace(/\.docx?$/i, '');
    return this.parseText(text, title);
  },
};
