import { embedBlob } from "./lib/model";

(window as unknown as { embedBlob: typeof embedBlob }).embedBlob = embedBlob;
document.documentElement.dataset.embed = "ready";
