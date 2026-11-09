// Remembers the interface language in a cookie, so the server can render the next page in the same language.
window.lumenxSetLang = function (language) {
  document.cookie = 'lumenx_lang=' + language + '; path=/; max-age=31536000; SameSite=Lax';
  document.documentElement.lang = language;
};
