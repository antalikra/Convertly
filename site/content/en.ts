import type { SiteCopy } from './types';

const notUploaded =
  'No. The conversion happens in your browser, on this computer. The page does not send your files, their names or any usage statistics anywhere, and it has no analytics.';

export const en: SiteCopy = {
  lang: 'en',
  name: 'English',
  nav: {
    'heic-to-jpg': 'HEIC to JPG',
    'heic-to-png': 'HEIC to PNG',
    'heic-to-pdf': 'HEIC to PDF',
    'webp-to-jpg': 'WebP to JPG',
    'merge-pdf': 'Merge PDF',
    'wav-to-mp3': 'WAV to MP3',
  },
  ui: {
    skip: 'Skip to the converter',
    tools: 'Tools',
    headerCta: 'Add to Chrome',
    facts: ['Nothing is uploaded', 'Free, no sign-up', 'No watermark', 'Up to 200 files at once'],
    converter: 'Converter',
    noscript: 'The converter runs in your browser and needs JavaScript.',
    offerText: 'Done, and nothing left your computer. Want it one click away? The Chrome extension does the same, even offline.',
    offerButton: 'Add to Chrome',
    ctaTitle: 'Get Convertly for Chrome',
    ctaText:
      'The same converter in its own window, one click from the toolbar. It works without an internet connection and has no access to the sites you visit.',
    ctaPoints: ['Opens from the toolbar', 'Works offline', 'Images, audio and PDF in 14 languages'],
    ctaButton: 'Add to Chrome, it’s free',
    ctaNote: 'Chrome on a computer. Also Edge, Brave and other Chromium browsers.',
    faqTitle: 'Questions and answers',
    privacy: 'Privacy policy',
    source: 'Source code',
    licenses: 'Licences',
    support: 'Support the project',
    footerNote: 'Convertly works entirely in your browser. No uploads, no analytics, no cookies.',
    language: 'Language',
    notFoundTitle: 'Page not found',
    notFoundText: 'There is nothing at this address. Pick a converter:',
  },
  privacy: {
    title: 'Privacy | Convertly',
    description: 'How the Convertly website handles your files and data: converted on your device, never uploaded, no analytics and no cookies.',
    h1: 'Privacy',
    body: [
      'This website runs the Convertly converter in your browser. The files you choose are read and converted on your device. They are never uploaded, sent or shared, and they are gone when you clear the list or close the page.',
      'The converter’s settings (output formats, quality and similar options, the theme) are saved in your browser’s local storage on this device. Nothing else is stored. Clear the site’s data in your browser to remove them.',
      'There are no analytics, no tracking, no advertising, no accounts and no cookies. The page loads only its own files: no third-party scripts, fonts or embeds.',
      'The site is hosted on GitHub Pages. GitHub may keep standard server logs, such as IP addresses, as described in the <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">GitHub Privacy Statement</a>.',
      'Links to the Chrome Web Store, Ko-fi and PayPal open those sites only when you click them; they have their own privacy policies. The Chrome extension has its own <a href="{ext-privacy}">privacy policy</a>.',
      'Questions: open an issue at <a href="{issues}">GitHub</a>.',
    ],
  },
  pages: {
    'heic-to-jpg': {
      title: 'HEIC to JPG Converter — Free, No Upload | Convertly',
      description:
        'Convert iPhone HEIC photos to JPG in your browser. Nothing is uploaded: photos stay on your device. Free, no sign-up, up to 200 photos at once.',
      h1: 'HEIC to JPG, without uploading your photos',
      lead: 'Drop your iPhone photos below and get JPGs back in seconds. The conversion runs in your browser, so the pictures never leave this computer.',
      sections: [
        {
          h2: 'Why iPhone photos are HEIC',
          body: 'Since iOS 11, iPhones save photos as HEIC, Apple’s flavour of the HEIF format. It keeps JPG quality at roughly half the file size, which is why Apple chose it. The catch is compatibility: Windows needs extra codecs to open HEIC, and many websites, forms, photo printers and older apps reject it. JPG opens everywhere, so converting is the quickest fix.',
        },
        {
          h2: 'Converted on your computer, not on a server',
          body: 'Most online converters upload your photos, convert them on their servers and send them back. Convertly works the other way round: this page loads the converter once, then your browser reads and converts the files locally. Nothing is sent anywhere; you can check it in the Network tab of your browser’s developer tools. There is no account, no watermark and no size limit other than your computer’s memory.',
        },
        {
          h2: 'Full size, good quality, no location data',
          body: 'The JPGs keep the full resolution of the original. The default quality of 90% gives a file close in size to the HEIC it came from, with no visible difference; lower it for smaller files, or resize to a longest side such as 1920 px for email and messengers. GPS location and other EXIF metadata are not copied into the new file, so the result is safer to share online.',
        },
        {
          h2: 'Many photos at once',
          body: 'Drop up to 200 photos at a time, convert them in one go and download them one by one or as a single ZIP. HEIF files work the same way. The same converter also makes <a href="{heic-to-png}">PNG</a>, WebP, AVIF and TIFF, or puts photos into a <a href="{heic-to-pdf}">PDF</a>.',
        },
      ],
      faq: [
        { q: 'Are my photos uploaded anywhere?', a: notUploaded },
        {
          q: 'Is it really free?',
          a: 'Yes. No sign-up, no watermark, no daily limit. If Convertly saves you time, you can support it with a donation.',
        },
        {
          q: 'Will the JPG look worse than the HEIC?',
          a: 'At the default 90% quality the difference is not visible in normal viewing. JPG is a lossy format, so for editing that needs every detail choose 100%, or convert to <a href="{heic-to-png}">PNG</a>, which is lossless.',
        },
        {
          q: 'Does the JPG keep the date and location?',
          a: 'No. EXIF metadata, including the GPS location and the date taken, is not copied. That protects your privacy when you share photos; if you need the original dates, keep the HEIC files as well.',
        },
        {
          q: 'Do I need to install anything?',
          a: 'No, the converter works on this page in a modern browser on Windows, macOS or Linux. If you convert photos often, the <a href="{store}">Chrome extension</a> opens the same converter from the toolbar and works offline.',
        },
      ],
    },
    'heic-to-png': {
      title: 'HEIC to PNG Converter — Lossless, No Upload | Convertly',
      description:
        'Convert iPhone HEIC photos to lossless PNG in your browser. Nothing is uploaded. Free, no sign-up, batch conversion with a single ZIP download.',
      h1: 'HEIC to PNG, lossless and private',
      lead: 'Turn iPhone photos into PNG files without sending them anywhere. Drop the HEIC files below; the conversion runs on your computer.',
      sections: [
        {
          h2: 'When PNG is the better choice',
          body: 'PNG is lossless: every pixel of the decoded photo is stored exactly, and it stays that way however many times you open and save the file. That makes PNG a good working format for editing, retouching, design and print layouts. For sharing and storage JPG is usually better; if that is what you need, use the <a href="{heic-to-jpg}">HEIC to JPG</a> converter.',
        },
        {
          h2: 'Expect bigger files',
          body: 'Lossless storage has a price: a PNG photo is usually several times larger than the HEIC it came from. If size matters, the quality slider helps. From 90% up the PNG stays lossless; below that Convertly reduces the colour palette, which makes the file much smaller while keeping the PNG format. You can also resize photos to a longest side, such as 2048 px.',
        },
        {
          h2: 'Your photos stay on your device',
          body: 'The page loads the converter once; after that your browser decodes the HEIC files and writes the PNGs locally. Nothing is uploaded, there is no account, and GPS location and other EXIF metadata are not copied into the new files.',
        },
        {
          h2: 'Convert a whole folder',
          body: 'Drop up to 200 photos at once and download the results one by one or as a single ZIP. JPG, WebP, AVIF, TIFF and other images can be turned into PNG the same way.',
        },
      ],
      faq: [
        {
          q: 'Is PNG better quality than JPG?',
          a: 'PNG stores the image without loss; JPG compresses it with a small loss. For a photo viewed on screen the difference at JPG 90% is hard to see. PNG matters when you will keep editing the image.',
        },
        {
          q: 'Why is the PNG so much bigger than the HEIC?',
          a: 'HEIC and JPG discard detail the eye barely notices; PNG keeps everything. Set the quality below 90% for a smaller palette-based PNG, or resize the photo.',
        },
        {
          q: 'Will the PNG have a transparent background?',
          a: 'No. iPhone photos have no transparent areas, so the PNG has none either.',
        },
        { q: 'Are my photos uploaded?', a: notUploaded },
        {
          q: 'Can I convert several photos at once?',
          a: 'Yes, up to 200 files per batch. Download them separately or as one ZIP archive.',
        },
      ],
    },
    'heic-to-pdf': {
      title: 'HEIC to PDF — iPhone Photos to PDF, No Upload | Convertly',
      description:
        'Put iPhone HEIC photos into one PDF, or one PDF per photo, right in your browser. A4, Letter or photo-sized pages. Nothing is uploaded.',
      h1: 'HEIC to PDF, without uploading your photos',
      lead: 'Turn photos of documents, receipts or notes into a PDF. Drop the HEIC files below, set the order and download one file.',
      sections: [
        {
          h2: 'Photos of documents, ready to send',
          body: 'Forms, offices and many email recipients want a PDF, not a stack of iPhone photos. Drop the pictures here and Convertly puts them into a single PDF, one photo per page. Drag the files by the handle to change the page order before you convert.',
        },
        {
          h2: 'Page size and layout',
          body: 'By default each page takes the exact size of its photo. For printing, choose A4 or Letter: photos are scaled to fit, with automatic, portrait or landscape orientation and an optional small or large margin.',
        },
        {
          h2: 'One PDF or several',
          body: 'Need a separate PDF for every photo? Switch Combine to “Each separate”. To make a few documents in one run, say an ID scan and a set of receipts, put the files into groups: each group becomes its own PDF. JPG, PNG and other images can be mixed with HEIC in the same file.',
        },
        {
          h2: 'Private by design',
          body: 'Photos of documents are exactly what you should not upload to unknown servers. Here the PDF is built in your browser, and neither the photos nor the result leave this computer. GPS location from the photos is not carried into the PDF.',
        },
      ],
      faq: [
        {
          q: 'Can I change the order of the pages?',
          a: 'Yes. Drag the files by the handle on the left; the PDF follows the order of the list.',
        },
        {
          q: 'Can I make one PDF per photo?',
          a: 'Yes. Choose “Each separate”, or put photos into groups to get one PDF per group.',
        },
        {
          q: 'What page size is used?',
          a: 'Each page matches its photo by default. A4 and Letter are available for printing, with orientation and margin options.',
        },
        {
          q: 'Can I search the text in the PDF?',
          a: 'No. The pages are images of your photos, and text in them is not recognised (there is no OCR).',
        },
        { q: 'Are my photos uploaded?', a: notUploaded },
      ],
    },
    'webp-to-jpg': {
      title: 'WebP to JPG Converter — Free, No Upload | Convertly',
      description:
        'Convert WebP images to JPG in your browser, for apps and sites that don’t accept WebP. Transparent areas turn white. Nothing is uploaded.',
      h1: 'WebP to JPG, right in your browser',
      lead: 'Saved an image from a website and got a .webp file? Drop it below and get a JPG that opens everywhere.',
      sections: [
        {
          h2: 'Why images download as WebP',
          body: 'Websites serve WebP because it is smaller than JPG and PNG at the same quality. Browsers handle it fine, but plenty of software still does not: older photo editors, some office apps, printing services and upload forms that only take JPG or PNG.',
        },
        {
          h2: 'How the conversion works',
          body: 'Your browser decodes the WebP and Convertly saves it as a JPG, at 90% quality by default; move the slider for smaller files. JPG has no transparency, so transparent areas become white. If you need to keep them, convert to PNG instead. An animated WebP becomes a still image of its first frame.',
        },
        {
          h2: 'Nothing is uploaded',
          body: 'The images are converted on this computer. The page does not send them anywhere, needs no account and adds no watermark.',
        },
        {
          h2: 'Other formats too',
          body: 'The same converter turns PNG, GIF, BMP, AVIF, TIFF and iPhone <a href="{heic-to-jpg}">HEIC photos</a> into JPG, and converts the other way as well: to PNG, WebP, AVIF, TIFF or BMP. Up to 200 files per batch, with a ZIP download.',
        },
      ],
      faq: [
        {
          q: 'Does converting WebP to JPG reduce quality?',
          a: 'Slightly, because JPG is lossy, but at 90% it is not visible. If the WebP was lossless and you want to keep every pixel, convert it to PNG.',
        },
        {
          q: 'What happens to transparent backgrounds?',
          a: 'They become white, since JPG has no transparency. PNG keeps transparency.',
        },
        {
          q: 'Can I convert many WebP files at once?',
          a: 'Yes, up to 200 per batch. Download them separately or as one ZIP.',
        },
        { q: 'Are my images uploaded?', a: notUploaded },
      ],
    },
    'merge-pdf': {
      title: 'Merge PDF Files — Free, Without Uploading | Convertly',
      description:
        'Combine PDF files into one in your browser. Drag to set the order, or build several merged PDFs at once. Your documents are never uploaded.',
      h1: 'Merge PDF files without uploading them',
      lead: 'Drop your PDFs below, drag them into the right order and download one combined file. Everything happens on your computer.',
      sections: [
        {
          h2: 'Your documents stay private',
          body: 'Contracts, bank statements, medical records, ID scans: the PDFs people merge are often the ones they least want on someone else’s server. Convertly merges them in your browser. The files are read from your disk, combined in memory and saved to your downloads; nothing is sent over the network.',
        },
        {
          h2: 'How to merge',
          body: 'Drop two or more PDF files; Merge is already selected. Drag the files by the handle to set the order, press Convert and download the result, named after the first file. Pages are copied as they are, so text stays selectable and the quality does not change.',
        },
        {
          h2: 'Several merged files at once',
          body: 'Put files into groups to build more than one PDF in a single run, for example one file per client or per month. Each group becomes its own merged PDF.',
        },
        {
          h2: 'More PDF tools on the same page',
          body: 'Switch the operation to split a PDF into pages, rotate, compress, keep or reorder selected pages, add a text stamp or page numbers, or convert pages to JPG, PNG, text or DOCX. Word documents (DOCX) can be turned into PDF too.',
        },
      ],
      faq: [
        {
          q: 'Is there a limit on the number or size of files?',
          a: 'Up to 200 files per batch. Size is limited only by your computer’s memory; very large PDFs simply take longer.',
        },
        {
          q: 'Can I merge password-protected PDFs?',
          a: 'No. Encrypted PDFs cannot be opened for merging; remove the password in a PDF reader first.',
        },
        {
          q: 'Will the merged PDF lose quality?',
          a: 'No. Pages are copied without re-rendering, so text and images stay exactly as they were.',
        },
        { q: 'Are my files uploaded?', a: notUploaded },
      ],
    },
    'wav-to-mp3': {
      title: 'WAV to MP3 Converter — Free, No Upload | Convertly',
      description:
        'Convert WAV recordings to MP3 in your browser at 128–320 kbps. Trim, mix to mono or normalize volume. Your audio never leaves your device.',
      h1: 'WAV to MP3, converted on your computer',
      lead: 'Drop WAV files below and get MP3s about seven times smaller at the default 192 kbps. Nothing is uploaded: the audio is encoded in your browser.',
      sections: [
        {
          h2: 'Why convert WAV to MP3',
          body: 'WAV stores audio uncompressed: a minute of CD-quality stereo takes about 10 MB. That is right for recording and editing, but too big for email, messengers, upload limits or a phone full of voice notes. MP3 at 192 kbps takes about 1.4 MB per minute and plays on practically everything.',
        },
        {
          h2: 'Pick the bitrate',
          body: '128 kbps is plenty for speech, lectures and voice memos. 192 kbps, the default, suits most music. 256 or 320 kbps keeps more detail in music you care about. Mixing to mono helps when a recording has one silent channel.',
        },
        {
          h2: 'Trim and fix the volume',
          body: 'Cut silence from the start or the end with the trim controls, and use Normalize to bring a quiet recording up to a consistent level. The changes are applied while encoding; your original WAV stays untouched.',
        },
        {
          h2: 'Private recordings stay private',
          body: 'Interviews, meetings and voice memos are converted on this computer; nothing is uploaded. The same converter also takes FLAC, M4A, AAC, OGG and MP3 files, and can save OGG or WAV as well.',
        },
      ],
      faq: [
        {
          q: 'Which bitrate should I choose?',
          a: '128 kbps for speech, 192 kbps for most music, 320 kbps when you want the best MP3 quality.',
        },
        {
          q: 'Does the MP3 keep tags like title and artist?',
          a: 'No, tags are not copied. WAV files rarely carry them anyway.',
        },
        {
          q: 'Is there a length limit?',
          a: 'There is no fixed limit. The whole recording is decoded in memory, so recordings several hours long need a computer with plenty of RAM.',
        },
        { q: 'Are my recordings uploaded?', a: notUploaded },
      ],
    },
  },
};
