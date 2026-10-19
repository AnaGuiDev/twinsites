The vision weights in this folder are the quantized ONNX conversion of MobileCLIP-S0 published for Transformers.js.

The original model is covered by the Apple license in `LICENSE`. Redistribute that notice with the weights. The Apple name is not used here to endorse Twinsites.

`config.json` asks for the 8-bit vision file (`q8`) so the site can ship a single ~12 MB model and never fetch weights from another host.
