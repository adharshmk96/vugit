"use strict";

/* Shared helpers used by the Alpine UI. Keep this file Alpine-free. */

const VU_ICONS = {
  home: `<path fill="currentColor" d="M6.907 2.31a2.25 2.25 0 0 1 2.186 0l5.25 2.89c.486.267.907.827.907 1.414v6.636A2.75 2.75 0 0 1 12.5 16h-9A2.75 2.75 0 0 1 .75 13.25V6.614c0-.587.421-1.147.907-1.414l5.25-2.89ZM8 3.655 2.75 6.545v6.705c0 .69.56 1.25 1.25 1.25h1.75v-4.25c0-.69.56-1.25 1.25-1.25h2c.69 0 1.25.56 1.25 1.25v4.25h1.75c.69 0 1.25-.56 1.25-1.25V6.545L8 3.655Z"/>`,
  branch: `<path fill="currentColor" d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>`,
  commit: `<path fill="currentColor" d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>`,
  diff: `<path fill="currentColor" d="M8.75 1.75a.75.75 0 0 0-1.5 0V5H5a.75.75 0 0 0 0 1.5h2.25v3.25a.75.75 0 0 0 1.5 0V6.5H11A.75.75 0 0 0 11 5H8.75V1.75ZM1.5 8A1.5 1.5 0 0 1 3 6.5h.75a.75.75 0 0 1 0 1.5H3a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V8.5a.5.5 0 0 0-.5-.5h-.75a.75.75 0 0 1 0-1.5H13A1.5 1.5 0 0 1 14.5 8v4a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12Z"/>`,
  tag: `<path fill="currentColor" d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>`,
  globe: `<path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.03-4.22A7.03 7.03 0 0 0 8 3.5c-.71 0-1.39.1-2.03.28A5.01 5.01 0 0 1 8 4.75c.75 0 1.46-.16 2.03-.47a5 5 0 0 1 .5-1.5ZM4.22 5.28A7.03 7.03 0 0 0 3.5 8c0 .71.1 1.39.28 2.03.31-.57.47-1.28.47-2.03 0-.75-.16-1.46-.47-2.03a5 5 0 0 1 .44-.69Zm7.56 0c.31.57.47 1.28.47 2.03s-.16 1.46-.47 2.03c.18-.64.28-1.32.28-2.03s-.1-1.39-.28-2.03ZM8 11.25c.75 0 1.46.16 2.03.47A7.03 7.03 0 0 1 8 12.5c-.71 0-1.39-.1-2.03-.28.57-.31 1.28-.47 2.03-.47Z"/>`,
  package: `<path fill="currentColor" d="m7.775.26 6.99 4.007a1.75 1.75 0 0 1 0 3.118l-6.99 4.007a1.748 1.748 0 0 1-1.736.002L.89 7.387A1.75 1.75 0 0 1 .89 4.27L7.86.26a1.75 1.75 0 0 1 1.736.001l-.82.45Zm.87 1.292-.868-.498-.868.498L1.71 5.39l5.198 2.98 5.197-2.98Zm5.47 5.197-5.197 2.98-5.198-2.98-.85.487 5.18 2.97a.25.25 0 0 0 .25 0l5.18-2.97Z"/>`,
  history: `<path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25a.75.75 0 0 0-1.5 0v3.69l2.28 2.28a.75.75 0 1 0 1.06-1.06L8.5 8.19Z"/>`,
  layers: `<path fill="currentColor" d="M8.75 1.75a.75.75 0 0 0-1.5 0V4H5a.75.75 0 0 0 0 1.5h2.25V8H5A.75.75 0 0 0 5 9.5h2.25V12H5a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0V13.5H11A.75.75 0 0 0 11 12H8.75V9.5H11A.75.75 0 0 0 11 8H8.75V5.5H11A.75.75 0 0 0 11 4H8.75V1.75Z"/>`,
  gear: `<path fill="currentColor" d="M8 0a8.2 8.2 0 0 1 .743.025 1.75 1.75 0 0 1 1.4 1.31l.192.75a.25.25 0 0 0 .282.19l.78-.08a1.75 1.75 0 0 1 1.833 1.054l.37.66a1.75 1.75 0 0 1-.192 1.98l-.53.602a.25.25 0 0 0 0 .328l.53.602a1.75 1.75 0 0 1 .192 1.98l-.37.66a1.75 1.75 0 0 1-1.833 1.054l-.78-.08a.25.25 0 0 0-.282.19l-.192.75a1.75 1.75 0 0 1-1.4 1.31A8.2 8.2 0 0 1 8 16a8.2 8.2 0 0 1-.743-.025 1.75 1.75 0 0 1-1.4-1.31l-.192-.75a.25.25 0 0 0-.282-.19l-.78.08a1.75 1.75 0 0 1-1.833-1.054l-.37-.66a1.75 1.75 0 0 1 .192-1.98l.53-.602a.25.25 0 0 0 0-.328l-.53-.602a1.75 1.75 0 0 1-.192-1.98l.37-.66A1.75 1.75 0 0 1 4.603 3.24l.78.08a.25.25 0 0 0 .282-.19l.192-.75A1.75 1.75 0 0 1 7.257.025 8.2 8.2 0 0 1 8 0Zm0 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>`,
  refresh: `<path fill="currentColor" d="M8 3a5 5 0 1 0 4.546 2.914.75.75 0 0 1 1.364-.626A6.5 6.5 0 1 1 8 1.5V.75a.25.25 0 0 1 .4-.2l2.1 1.575a.25.25 0 0 1 0 .4L8.4 4.1a.25.25 0 0 1-.4-.2V3Z"/>`,
  plus: `<path fill="currentColor" d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>`,
  trash: `<path fill="currentColor" d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.5 3h7V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25V3ZM2.5 5.75c0-.414.336-.75.75-.75h9.5a.75.75 0 0 1 .75.75v8.5A1.75 1.75 0 0 1 11.75 16h-7.5A1.75 1.75 0 0 1 2.5 14.25Zm1.5 0v8.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-8.5Z"/>`,
  check: `<path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>`,
  x: `<path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>`,
  arrowUp: `<path fill="currentColor" d="M8.75 14.25a.75.75 0 0 1-1.5 0V4.61L4.22 7.64a.75.75 0 0 1-1.06-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8.75 4.61Z"/>`,
  arrowDown: `<path fill="currentColor" d="M8.75 1.75a.75.75 0 0 0-1.5 0v9.64L4.22 8.36a.75.75 0 0 0-1.06 1.06l4.25 4.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 1 0-1.06-1.06L8.75 11.39Z"/>`,
  download: `<path fill="currentColor" d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"/><path fill="currentColor" d="M7.25 7.69V2.75a.75.75 0 0 1 1.5 0v4.94l1.97-1.97a.85.85 0 0 1 1.06 0 .85.85 0 0 1 0 1.06L8.53 10.28a.75.75 0 0 1-1.06 0L4.22 7.03a.75.75 0 0 1 1.06-1.06l1.97 1.72Z"/>`,
  upload: `<path fill="currentColor" d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"/><path fill="currentColor" d="M11.78 4.72a.749.749 0 1 1-1.06 1.06L8.75 3.81V9.5a.75.75 0 0 1-1.5 0V3.81L5.28 5.78a.749.749 0 1 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25Z"/>`,
  merge: `<path fill="currentColor" d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/>`,
  rebase: `<path fill="currentColor" d="M5.75 1.5a.75.75 0 0 0-1.5 0v1.075A4.25 4.25 0 0 0 8.5 6.75h1.378a2.251 2.251 0 1 1 0 1.5H8.5A5.75 5.75 0 0 1 2.75 2.575V1.5a.75.75 0 0 0-1.5 0v9.128a2.251 2.251 0 1 0 1.5 0V7.123A4.251 4.251 0 0 0 6.5 3.25h.25a.75.75 0 0 0 0-1.5h-.25a5.73 5.73 0 0 0-.75-.038ZM4.25 14a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm8.5-6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>`,
  pencil: `<path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.353 0L10.811 3.5l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>`,
  copy: `<path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>`,
  checkout: `<path fill="currentColor" d="M2.5 3.75a.25.25 0 0 1 .25-.25h5.5a.75.75 0 0 0 0-1.5h-5.5A1.75 1.75 0 0 0 .75 3.75v8.5c0 .966.784 1.75 1.75 1.75h5.5a.75.75 0 0 0 0-1.5h-5.5a.25.25 0 0 1-.25-.25Zm9.47 1.47a.75.75 0 0 0-1.06 1.06l1.72 1.72H6.75a.75.75 0 0 0 0 1.5h5.88l-1.72 1.72a.75.75 0 1 0 1.06 1.06l3-3a.75.75 0 0 0 0-1.06Z"/>`,
  search: `<path fill="currentColor" d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>`,
  sparkle: `<path fill="currentColor" d="M7.998 1.5a.75.75 0 0 1 .673.418l1.882 3.815 4.21.611a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 13.347l-3.764 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.82 7.625a.75.75 0 0 1 .416-1.28l4.21-.61L7.327 1.92a.75.75 0 0 1 .671-.42Z"/>`,
  warning: `<path fill="currentColor" d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>`,
  undo: `<path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 1-6.326 8.13.75.75 0 1 1 1.46-.346A5 5 0 1 0 3.5 8H5.25a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 .999 8.75v-3.5a.75.75 0 0 1 1.5 0v1.2A6.48 6.48 0 0 1 8 1.5Z"/>`,
  revert: `<path fill="currentColor" d="M1.75 8.5a.75.75 0 0 1 0-1.5h7.784L6.97 4.47a.75.75 0 0 1 1.06-1.06l3.5 3.5a.75.75 0 0 1 0 1.06l-3.5 3.5a.75.75 0 0 1-1.06-1.06L9.534 8.5Z"/>`,
  cherry: `<path fill="currentColor" d="M7.47 10.78a.75.75 0 0 1 0 1.06l-2.47 2.47a.751.751 0 0 1-1.042.018.751.751 0 0 1-.018-1.042l2.47-2.47a.75.75 0 0 1 1.06 0Zm1.06-1.06a.75.75 0 1 1-1.06-1.06L9.94 6.19a.75.75 0 0 1 1.06 1.06ZM5.22 4.72a.75.75 0 0 1 0 1.06L2.75 8.25a.75.75 0 0 1-1.06-1.06L4.16 4.72a.75.75 0 0 1 1.06 0Zm5.5-1.97A3.25 3.25 0 0 1 14 6a.75.75 0 0 1-1.5 0 1.75 1.75 0 0 0-2.99-1.237.75.75 0 1 1-1.06-1.061A3.24 3.24 0 0 1 10.72 2.75Z"/>`,
  sync: `<path fill="currentColor" d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"/>`,
  play: `<path fill="currentColor" d="M6.5 4.5v7l6-3.5-6-3.5Z"/>`,
  file: `<path fill="currentColor" d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/>`,
  chevron: `<path fill="currentColor" d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/>`,
  hash: `<path fill="currentColor" d="M10.82 1.23a.75.75 0 0 1 .46.96l-.837 2.81h3.307a.75.75 0 0 1 0 1.5h-3.754l-.7 2.35h3.204a.75.75 0 0 1 0 1.5H9.743l-.837 2.81a.75.75 0 0 1-1.42-.5l.7-2.35H5.2l-.837 2.81a.75.75 0 0 1-1.42-.5l.7-2.35H.75a.75.75 0 0 1 0-1.5h3.307l.7-2.35H1.75a.75.75 0 0 1 0-1.5h3.204l.837-2.81a.75.75 0 1 1 1.42.5L7.76 6.5h2.986l.837-2.81a.75.75 0 0 1 .96-.46ZM7.313 8h2.985l.7-2.35H8.014Z"/>`,
  user: `<path fill="currentColor" d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>`,
  calendar: `<path fill="currentColor" d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 6.5v7.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V6.5Z"/>`,
  link: `<path fill="currentColor" d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/>`,
};

function icon(name, size) {
  const path = VU_ICONS[name];
  if (!path) return "";
  const s = size || 14;
  return `<svg class="ico-svg" viewBox="0 0 16 16" width="${s}" height="${s}" aria-hidden="true">${path}</svg>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

function hueFor(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function avatarStyle(str) {
  return `background:hsl(${hueFor(str)} 55% 45%)`;
}

function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function dash(v) {
  const s = String(v ?? "").trim();
  return s ? s : "\u2014";
}

function parseRefs(refs) {
  if (!refs) return [];
  return String(refs)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => {
      if (r.startsWith("HEAD")) return { cls: "head", text: r.replace("HEAD -> ", "") };
      if (r.startsWith("tag: ")) return { cls: "tag", text: r.slice(5) };
      if (r.includes("/")) return { cls: "remote", text: r };
      return { cls: "", text: r };
    });
}

async function apiGet(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "request failed");
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "request failed");
  return data;
}

async function copyText(text) {
  const value = String(text || "");
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return;
    }
    throw new Error("clipboard unavailable");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy failed");
  }
}

function layoutGraph(commits) {
  const layout = new Map();
  let lanes = [];

  for (const c of commits) {
    const parents = (c.parents || []).filter(Boolean);
    let col = lanes.indexOf(c.hash);
    if (col < 0) {
      col = lanes.indexOf(null);
      if (col < 0) {
        col = lanes.length;
        lanes.push(c.hash);
      } else {
        lanes[col] = c.hash;
      }
    }

    const before = lanes.slice();
    const next = lanes.slice();
    const first = parents[0] || null;
    next[col] = first;

    if (first) {
      const dup = next.findIndex((h, i) => i !== col && h === first);
      if (dup >= 0) next[col] = null;
    }

    for (let i = 1; i < parents.length; i++) {
      const p = parents[i];
      if (next.indexOf(p) >= 0) continue;
      const hole = next.indexOf(null);
      if (hole >= 0) next[hole] = p;
      else next.push(p);
    }

    const parentCols = [];
    for (const p of parents) {
      let dest = next.indexOf(p);
      if (dest < 0) dest = before.indexOf(p);
      if (dest >= 0) parentCols.push(dest);
    }

    const n = Math.max(before.length, next.length, col + 1, 1);
    const top = [];
    const bot = [];
    for (let i = 0; i < n; i++) {
      top.push(i === col ? "*" : before[i] ? "|" : " ");
      bot.push(" ");
    }
    for (let i = 0; i < n; i++) {
      if (i !== col && before[i] && next[i] && before[i] === next[i]) bot[i] = "|";
    }
    for (const dest of parentCols) {
      if (dest === col) {
        bot[col] = "|";
        continue;
      }
      const ch = dest > col ? "\\" : "/";
      const step = dest > col ? 1 : -1;
      if (bot[col] === " ") bot[col] = ch;
      for (let i = col + step; i !== dest; i += step) {
        if (i < 0 || i >= n) break;
        if (bot[i] === " ") bot[i] = ch;
      }
      if (dest >= 0 && dest < n && bot[dest] === " ") bot[dest] = ch;
    }

    layout.set(c.hash, { col, ascii: top.join(" ") + "\n" + bot.join(" ") });
    lanes = next;
    while (lanes.length && lanes[lanes.length - 1] == null) lanes.pop();
  }
  return layout;
}

const DIFF_META_PREFIXES = [
  "diff ",
  "index ",
  "+++",
  "---",
  "new file",
  "deleted file",
  "old mode",
  "new mode",
  "similarity index",
  "rename from",
  "rename to",
  "copy from",
  "copy to",
  "Binary files",
  "\\",
];

function looksBinary(diff) {
  const s = String(diff || "");
  if (!s) return false;
  if (s.includes("\0")) return true;
  if (/Binary files .+ differ/i.test(s)) return true;
  if (/^GIT binary patch/m.test(s)) return true;
  if (/^Binary file /m.test(s)) return true;
  return false;
}

function summarizeBinary(diff) {
  const s = String(diff || "");
  const m = s.match(/Binary files .+ differ/i) || s.match(/^Binary file .+$/m);
  if (m) return m[0];
  return "Binary file — no textual diff";
}

function parseUnifiedDiff(text) {
  const raw = String(text || "");
  const lines = raw.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  const files = [];
  let file = { headerLines: [], hunks: [] };
  let seenDiff = false;

  const pushFile = () => {
    if (file.headerLines.length || file.hunks.length) files.push(file);
    file = { headerLines: [], hunks: [] };
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (seenDiff || file.hunks.length) pushFile();
      seenDiff = true;
      file.headerLines.push(line);
      continue;
    }
    if (line.startsWith("@@")) {
      file.hunks.push({ header: line, lines: [] });
      continue;
    }
    if (file.hunks.length) file.hunks[file.hunks.length - 1].lines.push(line);
    else file.headerLines.push(line);
  }
  pushFile();
  return files;
}

function buildHunkPatch(headerLines, hunk) {
  const headers = (headerLines || []).slice();
  while (headers.length && headers[headers.length - 1] === "") headers.pop();
  const parts = [];
  if (headers.length) parts.push(headers.join("\n"));
  parts.push(hunk.header);
  if (hunk.lines && hunk.lines.length) parts.push(hunk.lines.join("\n"));
  let patch = parts.join("\n");
  if (!patch.endsWith("\n")) patch += "\n";
  return patch;
}

function parseHunkHeader(header) {
  const m = String(header || "").match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/);
  if (!m) return { oldStart: 0, newStart: 0 };
  return {
    oldStart: Number(m[1]),
    oldCount: m[2] != null ? Number(m[2]) : 1,
    newStart: Number(m[3]),
    newCount: m[4] != null ? Number(m[4]) : 1,
  };
}

function isDiffMetaLine(line) {
  return DIFF_META_PREFIXES.some((p) => line.startsWith(p));
}

function renderDiffHtml(diff) {
  if (!diff || !String(diff).trim()) {
    return `<div class="diff-meta">No diff for this commit.</div>`;
  }
  if (looksBinary(diff)) {
    return `<div class="diff-meta">${esc(summarizeBinary(diff))}</div>`;
  }

  let oldLn = 0;
  let newLn = 0;
  const out = [];
  const lines = String(diff).replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (line.startsWith("@@")) {
      const m = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)/);
      if (m) {
        oldLn = Number(m[1]);
        newLn = Number(m[2]);
      }
      out.push(`<div class="diff-hunk">${esc(line)}</div>`);
      continue;
    }
    if (isDiffMetaLine(line)) {
      out.push(`<div class="diff-meta">${esc(line)}</div>`);
      continue;
    }
    if (line.startsWith("+")) {
      out.push(
        `<div class="diff-line diff-add"><span class="ln"></span><span class="ln">${newLn++}</span><span class="code">${esc(
          line
        )}</span></div>`
      );
      continue;
    }
    if (line.startsWith("-")) {
      out.push(
        `<div class="diff-line diff-del"><span class="ln">${oldLn++}</span><span class="ln"></span><span class="code">${esc(
          line
        )}</span></div>`
      );
      continue;
    }
    out.push(
      `<div class="diff-line"><span class="ln">${oldLn > 0 ? oldLn++ : ""}</span><span class="ln">${
        newLn > 0 ? newLn++ : ""
      }</span><span class="code">${esc(line)}</span></div>`
    );
  }
  return out.join("");
}

function renderUnifiedHunkHtml(hunk) {
  const { oldStart, newStart } = parseHunkHeader(hunk.header);
  let oldLn = oldStart;
  let newLn = newStart;
  const out = [];
  for (const line of hunk.lines || []) {
    const ch = line[0];
    if (ch === "+") {
      out.push(
        `<div class="diff-line diff-add"><span class="ln"></span><span class="ln">${newLn++}</span><span class="code">${esc(
          line
        )}</span></div>`
      );
    } else if (ch === "-") {
      out.push(
        `<div class="diff-line diff-del"><span class="ln">${oldLn++}</span><span class="ln"></span><span class="code">${esc(
          line
        )}</span></div>`
      );
    } else if (ch === "\\") {
      out.push(
        `<div class="diff-line"><span class="ln"></span><span class="ln"></span><span class="code">${esc(line)}</span></div>`
      );
    } else {
      out.push(
        `<div class="diff-line"><span class="ln">${oldLn++}</span><span class="ln">${newLn++}</span><span class="code">${esc(
          line
        )}</span></div>`
      );
    }
  }
  if (!out.length) out.push(`<div class="diff-meta">Empty hunk</div>`);
  return out.join("");
}

function renderSideHunkHtml(hunk) {
  const { oldStart, newStart } = parseHunkHeader(hunk.header);
  let oldLn = oldStart;
  let newLn = newStart;
  const lines = hunk.lines || [];
  let i = 0;
  const left = [`<div class="col-h">Before</div>`];
  const right = [`<div class="col-h">After</div>`];
  const blank = `<div class="diff-line"><span class="ln"></span><span class="ln"></span><span class="code"></span></div>`;

  const sideLine = (kind, num, text) => {
    const n = num == null ? "" : String(num);
    const cls = kind ? ` diff-line ${kind}` : " diff-line";
    if (kind === "diff-del") {
      return `<div class="${cls.trim()}"><span class="ln">${n}</span><span class="ln"></span><span class="code">${esc(
        text
      )}</span></div>`;
    }
    if (kind === "diff-add") {
      return `<div class="${cls.trim()}"><span class="ln"></span><span class="ln">${n}</span><span class="code">${esc(
        text
      )}</span></div>`;
    }
    return `<div class="diff-line"><span class="ln">${n}</span><span class="ln">${n}</span><span class="code">${esc(
      text
    )}</span></div>`;
  };

  while (i < lines.length) {
    const line = lines[i];
    const ch = line[0];
    if (ch === "-") {
      const dels = [];
      const adds = [];
      while (i < lines.length && lines[i][0] === "-") dels.push(lines[i++]);
      while (i < lines.length && lines[i][0] === "+") adds.push(lines[i++]);
      const n = Math.max(dels.length, adds.length);
      for (let k = 0; k < n; k++) {
        left.push(k < dels.length ? sideLine("diff-del", oldLn++, dels[k]) : blank);
        right.push(k < adds.length ? sideLine("diff-add", newLn++, adds[k]) : blank);
      }
    } else if (ch === "+") {
      left.push(blank);
      right.push(sideLine("diff-add", newLn++, line));
      i++;
    } else if (ch === "\\") {
      i++;
    } else {
      left.push(sideLine("", oldLn, line));
      right.push(sideLine("", newLn, line));
      oldLn++;
      newLn++;
      i++;
    }
  }
  return `<div class="side-diff"><div class="col">${left.join("")}</div><div class="col">${right.join("")}</div></div>`;
}

function unquoteGitPath(s) {
  s = String(s || "").trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    s = s.slice(1, -1).replace(/\\([\\"ntr])/g, (_, c) => {
      if (c === "n") return "\n";
      if (c === "t") return "\t";
      if (c === "r") return "\r";
      return c;
    });
  }
  return s;
}

function entryPath(entry) {
  let p = String((entry && entry.path) || "");
  const arrow = " -> ";
  const i = p.lastIndexOf(arrow);
  if (i !== -1) p = p.slice(i + arrow.length);
  return unquoteGitPath(p);
}

function normalizeStatus(st) {
  st = st || {};
  return {
    clean: !!st.clean,
    staged: Array.isArray(st.staged) ? st.staged : [],
    unstaged: Array.isArray(st.unstaged) ? st.unstaged : [],
    untracked: Array.isArray(st.untracked) ? st.untracked : [],
    conflicted: Array.isArray(st.conflicted) ? st.conflicted : [],
  };
}

window.VU = {
  icon,
  esc,
  initials,
  hueFor,
  avatarStyle,
  fmtDate,
  dash,
  parseRefs,
  apiGet,
  apiPost,
  copyText,
  layoutGraph,
  looksBinary,
  summarizeBinary,
  parseUnifiedDiff,
  buildHunkPatch,
  parseHunkHeader,
  renderDiffHtml,
  renderUnifiedHunkHtml,
  renderSideHunkHtml,
  entryPath,
  normalizeStatus,
};
