import {useState} from "react";
import {saveTeamCoachProfile} from "@/lib/team-coach-directory-api";

export function TeamCoachProfileEditor({email,name,bio="",photo="",onSaved}:{email:string;name:string;bio?:string;photo?:string;onSaved?:()=>void}){
 const [displayName,setDisplayName]=useState(name),[text,setText]=useState(bio),[image,setImage]=useState(photo),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 return <details className="rounded-lg border border-line bg-paper-2" data-coach-profile-editor={email}>
  <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-semibold text-maroon">Edit bio / photo: {name}</summary>
  <form className="grid gap-2 border-t p-3" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");setNotice("");try{await saveTeamCoachProfile({data:{email,name:displayName,bio:text,photo:image}});setNotice("Coach profile saved.");onSaved?.();}catch(err){setError(err instanceof Error?err.message:"Could not save coach profile.");}finally{setBusy(false);}}}>
  <h3 className="font-semibold">Coach profile: {name}</h3>
  {image&&<img src={image} alt={displayName} className="h-24 w-24 rounded-lg object-cover"/>}
  <label className="grid gap-1">Profile picture (JPEG, PNG or WebP)
   <input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setError("");if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5_000_000){setError("Choose a JPEG, PNG or WebP smaller than 5 MB.");return;}try{const src=URL.createObjectURL(file);const img=new Image();img.src=src;await img.decode();const canvas=document.createElement("canvas");const scale=Math.min(1,500/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Image processing unavailable.");ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(src);const result=canvas.toDataURL("image/jpeg",0.75);if(result.length>250000)throw new Error("Image is too large after resizing. Choose a smaller picture.");setImage(result);}catch(err){setError(err instanceof Error?err.message:"Could not process photo.");}}}/>
  </label>
  {image&&<button type="button" className="text-left text-sm underline" onClick={()=>setImage("")}>Remove picture</button>}
  <label className="grid gap-1">Display name<input required maxLength={120} value={displayName} onChange={e=>setDisplayName(e.target.value)} className="min-h-11 rounded border px-3"/></label>
  <label className="grid gap-1">Coach bio<textarea maxLength={2000} rows={4} value={text} onChange={e=>setText(e.target.value)} className="rounded border p-3"/></label>
  <button type="submit" disabled={busy} className="min-h-11 rounded bg-maroon px-4 text-white">{busy?"Saving…":"Save coach bio and picture"}</button>
  {error&&<p role="alert" className="text-sm text-maroon">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
 </form></details>;
}
