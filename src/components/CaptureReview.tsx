import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { captureIssue } from '../lib/capture-quality';
import { cropHero } from '../lib/crop';
export function CaptureReview({file,onAccept,onCancel}:{file:File;onAccept:()=>void;onCancel:()=>void}) {
  const {lang}=useI18n(); const es=lang==='es';
  const [preview,setPreview]=useState(''); const [issue,setIssue]=useState('');
  const [cropped,setCropped]=useState(false); const [checked,setChecked]=useState(false);
  useEffect(()=>{
    let active=true; let url='';
    setPreview('');setIssue('');setChecked(false);setCropped(false);
    document.getElementById('capture-heading')?.focus();
    (async()=>{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('format');
      if(file.size>20*1024*1024) throw Error('large');
      const bitmap=await createImageBitmap(file);
      const problem=captureIssue(bitmap.width,bitmap.height); bitmap.close();
      if(problem) throw Error(problem);
      const frame=await cropHero(file); frame.bitmap.close();
      if(!active)return;
      url=URL.createObjectURL(frame.blob);setPreview(url);setCropped(frame.cropped);
    })().catch(error=>{if(active)setIssue(error instanceof Error?error.message:'decode');});
    return ()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[file]);
  const messages:Record<string,string>=es?{
    small:'La captura tiene poca resolución. Usa una captura de escritorio de al menos 640 × 320 px; recomendamos 1440 × 900.',
    portrait:'Esta captura parece de móvil. El catálogo es de escritorio: usa una captura de escritorio para evitar una comparación engañosa.',
    large:'La imagen es demasiado grande. Usa solo la primera pantalla, con un máximo de 20 MB y 40 megapíxeles.',
    format:'Usa una imagen PNG, JPEG o WebP estática.',
  }:{small:'This capture is too small. Use a desktop screenshot of at least 640 × 320 px; 1440 × 900 is recommended.',portrait:'This looks like a phone capture. The catalog uses desktop screenshots: use a desktop capture to avoid a misleading comparison.',large:'This image is too large. Use the first screen only, up to 20 MB and 40 megapixels.',format:'Use a static PNG, JPEG or WebP image.'};
  return <section className="capture-review" aria-labelledby="capture-heading"><h2 id="capture-heading" tabIndex={-1}>{es?'Comprueba qué vamos a comparar':'Check what we will compare'}</h2>
    <p>{es?'La comparación es orientativa y puede omitir parecidos o proponer coincidencias incorrectas. No mide la calidad de tu web ni demuestra que esté creada con IA.':'Comparison is indicative and can miss similarities or suggest incorrect matches. It does not measure website quality or prove AI authorship.'}</p>
    {issue?<p role="alert">{messages[issue]||(es?'No podemos leer esta imagen. Prueba con otra captura.':'We cannot read this image. Try another screenshot.')}</p>:preview?<><img src={preview} alt={es?'Región exacta que se analizará':'Exact region to be analyzed'}/><p>{cropped?(es?'Se analizará solo la franja superior mostrada.':'Only the top region shown will be analyzed.'):(es?'Se analizará la imagen mostrada.':'The displayed image will be analyzed.')}</p><label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{es?'Veo la página cargada, sin ventanas ni banners que oculten su contenido.':'I can see the loaded page, without dialogs or banners covering its content.'}</label><p>{es?'La imagen se procesa en este dispositivo. La primera comparación descarga el motor; puede tardar según la conexión.':'The image is processed on this device. The first comparison downloads the engine; timing depends on your connection.'}</p><button className="ticket" disabled={!checked} onClick={onAccept}>{es?'Comparar esta captura':'Compare this capture'}</button></>:<p role="status">{es?'Preparando vista previa…':'Preparing preview…'}</p>}
    <button className="text-link" onClick={onCancel}>{es?'Volver sin analizar':'Return without analyzing'}</button></section>;
}
