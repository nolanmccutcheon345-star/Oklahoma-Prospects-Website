/** Bounds nested JSON before a shared working record can be merged. */
export function validateRecord(value:unknown,depth=0):void {
 if(depth>16)throw new Error('Record nesting is too deep.');
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='string'){if(value.length>20000)throw new Error('Record text is too long.');return;}
 if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Invalid record number.');return;}
 if(Array.isArray(value)){if(value.length>10000)throw new Error('Record has too many rows.');value.forEach(v=>validateRecord(v,depth+1));return;}
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw new Error('Invalid record value.');
 const entries=Object.entries(value);if(entries.length>1000)throw new Error('Record has too many fields.');
 for(const [key,entry] of entries){if(['__proto__','constructor','prototype'].includes(key)||key.length>200)throw new Error('Invalid record field.');if(entry!==undefined)validateRecord(entry,depth+1);}
}
