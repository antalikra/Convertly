# Privacy practices tab — answers for the review form

## Single purpose

Convertly converts files the user chooses (images such as iPhone HEIC photos, audio and PDF/Word documents) into other formats, locally in the browser, and lets the user download the results.

## Permission justifications

**storage**
Saves the user's settings (output formats, quality, resize, audio and PDF options, theme, the number of finished batches and whether the one-time rating request was answered) in `chrome.storage.local` on the user's device. Nothing is synced or transmitted.

There are no host permissions and no content scripts: files come from the user's drag-and-drop or file picker, and Convertly never reads web pages.

## Remote code

**No, I am not using remote code.** All JavaScript and WebAssembly ship in the package (HEIC decoder, AVIF/MP3/OGG encoders, the PDF.js worker). The CSP is `script-src 'self' 'wasm-unsafe-eval'`; `wasm-unsafe-eval` only allows the packaged WebAssembly encoders to be compiled. There is no `eval`, no `new Function` and nothing is loaded from the network.

## Data usage

Tick nothing. The files are read only in memory to convert them on the device, are not stored and are never transmitted; the only stored data is the settings listed above, which is not user data in any of the categories.

Certify all three disclosures:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: https://github.com/antalikra/Convertly/blob/main/store/PRIVACY.md

## Test instructions for the reviewer

Credentials: leave empty. Additional instructions (at most 500 characters):

No login needed. 1) Click the Convertly toolbar icon: a converter window opens. 2) Drop any photo (HEIC, JPG or PNG) into it or click to choose one. 3) Click "Convert", then the download button next to the file. 4) The "Documents" tab does the same for PDF and DOCX files (merge, split, rotate, to JPG/text). Everything runs locally; no network requests are made.
