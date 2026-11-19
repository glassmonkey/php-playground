import assert from 'node:assert/strict';

function offset(source, position) {
    assert.ok(Number.isInteger(position.line) && position.line >= 0, 'canonical line');
    assert.ok(Number.isInteger(position.character) && position.character >= 0, 'canonical UTF-16 column');
    const starts = [0], ends = [];
    for (let at = 0; at < source.length; at++) {
        if (source[at] === '\r' || source[at] === '\n') {
            ends.push(at);
            if (source[at] === '\r' && source[at + 1] === '\n') at++;
            starts.push(at + 1);
        }
    }
    ends.push(source.length);
    assert.ok(position.line < starts.length, 'line exists in original document');
    const start = starts[position.line], end = ends[position.line];
    assert.ok(position.character <= end - start, 'column excludes original terminator');
    const at = start + position.character;
    const previous = source.charCodeAt(at - 1), next = source.charCodeAt(at);
    assert.ok(!(previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff), 'UTF-16 edit boundary');
    return at;
}
function validate(source,item,expected) {
    assert.equal(item.label,expected.label);assert.equal(item.kind,expected.kind);assert.equal(item.filterText,expected.filter);
    assert.equal(item.insertText,expected.kind===7?expected.text:undefined);
    assert.equal(item.insertTextFormat,expected.format);assert.equal(item.insertTextMode,undefined);assert.equal(item.textEditText,undefined);assert.equal(item.command,undefined);
    if(expected.kind===7){assert.equal(item.data?.m,expected.identity);assert.equal(item.data?.c,'');assert.equal(item.data?.k,'class');assert.equal(item.detail,expected.identity);}else{assert.equal(item.data,undefined);assert.equal(item.detail,'variable');}
    assert.deepEqual(item.textEdit,{range:expected.range,newText:expected.text});
    assert.deepEqual(item.additionalTextEdits??[],[]);
    const edits=[item.textEdit,...(item.additionalTextEdits??[])].map(edit=>({start:offset(source,edit.range.start),end:offset(source,edit.range.end),text:expected.format===2?edit.newText.replaceAll('$0',''):edit.newText})).sort((a,b)=>b.start-a.start);
    let accepted=source,previous=source.length;
    for(const edit of edits){assert.ok(edit.start<=edit.end&&edit.end<=previous,'nonoverlapping edit');accepted=accepted.slice(0,edit.start)+edit.text+accepted.slice(edit.end);previous=edit.start;}
    assert.equal(accepted,expected.document);return accepted;
}
export function validateVariableAliasPair(source,initial,resolved,expected) {
    return {initial:validate(source,initial,expected),resolved:validate(source,resolved,expected)};
}

// Bounded default acceptance model for the authored release fixtures:
// unlinked numeric tabstops, nested numeric defaults and documented meta escaping.
// Editor variables, choices and transforms require a separate model.
function defaultSnippet(text) {
    let at = 0;
    const used = new Set();
    function part(nested) {
        let output = '';
        while (at < text.length) {
            const ch = text[at++];
            if (ch === '\\' && ['$', '}', '\\'].includes(text[at])) {
                output += text[at++];
            } else if (ch === '}' && nested) {
                return output;
            } else if (ch !== '$') {
                output += ch;
            } else {
                const braced = text[at] === '{';
                if (braced) at++;
                const begin = at;
                while (/[0-9]/.test(text[at] ?? '')) at++;
                assert.ok(at > begin, 'unsupported snippet variable or transform');
                const id = text.slice(begin, at);
                assert.ok(id === '0' || !used.has(id), 'linked snippet fields require a separate model');
                used.add(id);
                if (braced) {
                    if (text[at] === ':') { at++; output += part(true); }
                    else { assert.equal(text[at++], '}', 'unsupported snippet choice or transform'); }
                }
            }
        }
        assert.ok(!nested, 'unterminated default placeholder');
        return output;
    }
    return part(false);
}

// Release edit contracts compare both public payloads to independent source
// expectations. Identity alone cannot establish executable binding.
export function validateSelectedCompletionPair(source, initial, resolved, expected) {
    function accepted(item) {
        for (const key of ['label', 'kind', 'filterText', 'insertText', 'insertTextFormat', 'data']) {
            assert.deepEqual(item[key], expected[key], `selected completion ${key}`);
        }
        for (const key of ['detail', 'preselect']) {
            if (Object.hasOwn(expected, key)) assert.deepEqual(item[key], expected[key], `selected completion ${key}`);
        }
        for (const key of ['insertTextMode', 'textEditText', 'command']) {
            assert.equal(item[key], undefined, `unexpected ${key}`);
        }
        assert.deepEqual(item.textEdit, expected.textEdit, 'complete primary edit');
        assert.deepEqual(item.additionalTextEdits ?? [], expected.additionalTextEdits ?? [], 'all additional edits');
        const primary = item.textEdit ?? (expected.fallbackRange && {range: expected.fallbackRange, newText: item.insertText});
        assert.ok(primary && typeof primary.newText === 'string', 'authored default word range or explicit primary required');
        const edits = [primary, ...(item.additionalTextEdits ?? [])]
            .map(edit => ({start: offset(source, edit.range.start), end: offset(source, edit.range.end),
                text: edit === primary && item.insertTextFormat === 2 ? defaultSnippet(edit.newText) : edit.newText}));
        for (let a = 0; a < edits.length; a++) {
            for (let b = a + 1; b < edits.length; b++) {
                assert.ok(edits[a].start !== edits[b].start && !(edits[a].start < edits[b].end && edits[b].start < edits[a].end), 'nonoverlapping edits including insertion positions');
            }
        }
        edits.sort((a, b) => b.start - a.start);
        let document = source, previous = source.length;
        for (const edit of edits) {
            assert.ok(edit.start <= edit.end && edit.end <= previous, 'nonoverlapping full edits');
            document = document.slice(0, edit.start) + edit.text + document.slice(edit.end);
            previous = edit.start;
        }
        assert.equal(document, expected.document, 'independent accepted document');
        return document;
    }
    return { initial: accepted(initial), resolved: accepted(resolved) };
}

// Strict serialization reader for the authored Position fixtures. Empty cells
// use an entire-cell escape; no source bytes, empty rows or fields are trimmed.
export function decodePositionFixtureRows(text, rowCount, fieldCount) {
    assert.ok(text.endsWith('\n'), 'fixture terminal LF');
    const rawRows = text.slice(0, -1).split('\n');
    assert.equal(rawRows.length, rowCount, 'complete ordered fixture rows');
    return rawRows.map(row => {
        assert.notEqual(row, '', 'empty fixture row');
        const fields = row.split('\t');
        assert.equal(fields.length, fieldCount, 'complete fixture fields');
        return fields.map(value => {
            if (value === '\\e') return '';
            let result = '';
            for (let i = 0; i < value.length; i++) {
                const ch = value[i];
                if (ch !== '\\') { result += ch; continue; }
                const next = value[++i];
                assert.ok(next !== undefined && ['\\', 'n', 'r', 't'].includes(next), 'unknown or truncated fixture escape');
                result += ({'\\': '\\', n: '\n', r: '\r', t: '\t'})[next];
            }
            return result;
        });
    });
}

// PHP outside-state contract: an RPC error/malformed response is never absence.
export function validateOutsidePhpCompletion(response) {
    assert.ok(response && Object.hasOwn(response, 'result'), 'completion result exists');
    assert.equal(response.error, undefined, 'outside PHP request has no RPC error');
    const result = response.result;
    assert.ok(result === null || Array.isArray(result) ||
        (result && typeof result.isIncomplete === 'boolean' && Array.isArray(result.items)),
    'valid completion result shape');
    const items = result === null ? [] : Array.isArray(result) ? result : result.items;
    assert.deepEqual(items, [], 'outside PHP has no PHP completion edits');
    return items;
}

// onTypeFormatting returns plain TextEdits, without completion snippets.
export function validateOnTypeFormattingEdits(source, edits, expectedEdits, expectedDocument) {
    assert.deepEqual(edits, expectedEdits, 'complete on-type TextEdits');
    if (edits === null) {
        assert.equal(source, expectedDocument, 'absence preserves the original document');
        return source;
    }
    assert.ok(Array.isArray(edits), 'on-type TextEdits array');
    const spans = edits.map(edit => {
        assert.equal(typeof edit.newText, 'string', 'plain edit text');
        return {start: offset(source, edit.range.start), end: offset(source, edit.range.end), text: edit.newText};
    });
    for (let a = 0; a < spans.length; a++) {
        for (let b = a + 1; b < spans.length; b++) {
            assert.ok(spans[a].start !== spans[b].start && !(spans[a].start < spans[b].end && spans[b].start < spans[a].end), 'nonoverlapping on-type edits');
        }
    }
    spans.sort((a,b) => b.start-a.start);
    let document = source, previous = source.length;
    for (const edit of spans) {
        assert.ok(edit.start <= edit.end && edit.end <= previous, 'original on-type range');
        document = document.slice(0, edit.start) + edit.text + document.slice(edit.end);
        previous = edit.start;
    }
    assert.equal(document, expectedDocument, 'independent on-type document');
    return document;
}

export function validateJsonRpcResultResponse(response, id) {
    assert.ok(response && typeof response === 'object' && !Array.isArray(response), 'JSON-RPC response object');
    assert.deepEqual(Object.keys(response).sort(), ['id', 'jsonrpc', 'result'], 'result envelope only');
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, id, 'request identity');
    assert.notEqual(response.result, undefined, 'result is present, including explicit null');
    return response;
}

export function validateJsonRpcErrorResponse(response, id, expectedCode) {
    assert.ok(response && typeof response === 'object' && !Array.isArray(response), 'JSON-RPC response object');
    assert.deepEqual(Object.keys(response).sort(), ['error', 'id', 'jsonrpc'], 'error envelope has no result');
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, id, 'request identity');
    assert.ok(response.error && typeof response.error === 'object' && !Array.isArray(response.error));
    assert.deepEqual(Object.keys(response.error).sort(), ['code', 'message'], 'dispatcher error fields');
    assert.equal(response.error.code, expectedCode, 'declared protocol error code');
    assert.equal(typeof response.error.message, 'string');
    assert.ok(response.error.message.length > 0, 'nonempty protocol diagnostic');
    return response;
}
