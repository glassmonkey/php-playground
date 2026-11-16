import assert from 'node:assert/strict';

function offset(source, position) {
    const lines=source.split('\n');
    assert.ok(position.line<lines.length);
    const line=lines[position.line];
    assert.ok(position.character<=line.length);
    const previous=line.charCodeAt(position.character-1),next=line.charCodeAt(position.character);
    assert.ok(!(previous>=0xd800&&previous<=0xdbff&&next>=0xdc00&&next<=0xdfff),'UTF-16 edit boundary');
    return lines.slice(0,position.line).reduce((total,value)=>total+value.length+1,0)+position.character;
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

// Release edit contracts compare both public payloads to independent source
// expectations. Identity alone cannot establish executable binding.
export function validateSelectedCompletionPair(source, initial, resolved, expected) {
    function accepted(item) {
        for (const key of ['label', 'kind', 'filterText', 'insertText', 'insertTextFormat', 'data']) {
            assert.deepEqual(item[key], expected[key], `selected completion ${key}`);
        }
        for (const key of ['insertTextMode', 'textEditText', 'command']) {
            assert.equal(item[key], undefined, `unexpected ${key}`);
        }
        assert.deepEqual(item.textEdit, expected.textEdit, 'complete primary edit');
        assert.deepEqual(item.additionalTextEdits ?? [], expected.additionalTextEdits ?? [], 'all additional edits');
        const edits = [item.textEdit, ...(item.additionalTextEdits ?? [])]
            .map(edit => ({ start: offset(source, edit.range.start), end: offset(source, edit.range.end), text: edit.newText }))
            .sort((a, b) => b.start - a.start);
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
