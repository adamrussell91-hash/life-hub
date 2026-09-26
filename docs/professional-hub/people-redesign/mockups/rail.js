// Injects the live Professional Hub rail so each mockup stays short.
document.querySelector('.hub-rail').innerHTML = `
  <a class="hub-rail__brand" style="margin-bottom:24px">Professional Hub</a>
  <nav class="hub-rail__nav">
    <a class="hub-rail__link"><svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/></svg>Home</a>
    <div class="hub-rail__section">Network</div>
    <a class="hub-rail__link is-current"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.2 14.2c2.6.1 4.8 2.2 4.8 5.3"/></svg>People</a>
    <a class="hub-rail__link"><svg viewBox="0 0 24 24"><rect x="5" y="9" width="6" height="11"/><rect x="13" y="4" width="6" height="16"/></svg>Organisations</a>
    <a class="hub-rail__link"><svg viewBox="0 0 24 24"><path d="M4 6h16v10H8l-4 4z"/></svg>Communications</a>
    <a class="hub-rail__link"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>Meetings</a>
    <a class="hub-rail__link"><svg viewBox="0 0 24 24"><path d="M12 4v10M8 10l4 4 4-4M5 20h14"/></svg>Events</a>
    <a class="hub-rail__link"><svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/></svg>Applications</a>
    <a class="hub-rail__link"><svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V5h6v3"/></svg>Career</a>
    <a class="hub-rail__link"><svg viewBox="0 0 24 24"><circle cx="6" cy="6.5" r="2.1"/><circle cx="18" cy="9" r="2.1"/><circle cx="8" cy="18" r="2.1"/><path d="M7.7 8.1 9 15.5M16.1 10 10 16.3"/></svg>Network Ecology</a>
    <div class="hub-rail__section">Hubs</div>
    <a class="hub-rail__link">Life</a><a class="hub-rail__link">Teaching</a><a class="hub-rail__link">Knowledge</a>
  </nav>`;
