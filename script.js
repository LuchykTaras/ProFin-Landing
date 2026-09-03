document.addEventListener('DOMContentLoaded', () => {
  // Плавний скрол по якірних посиланнях навігації та кнопок
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');

      if (targetId === '#' || !targetId) return;

      const targetElement = document.querySelector(targetId);

      if (targetElement) {
        e.preventDefault();

        const headerOffset = 76;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition =
          elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  initLeadForm();
});

function initLeadForm() {
  const form = document.querySelector('#lead-form');

  if (!form) return;

  const submitButton = form.querySelector('#lead-submit');
  const status = form.querySelector('#lead-form-status');

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    setLeadFormState({
      submitButton,
      status,
      loading: true,
      message: 'Надсилаємо заявку…',
      type: 'loading'
    });

    const formData = new FormData(form);
    const attribution = getLeadAttribution();

    const payload = {
      name: cleanValue(formData.get('name')),
      company: cleanValue(formData.get('company')),
      phone: cleanValue(formData.get('phone')),
      email: cleanValue(formData.get('email')),
      currentSystem: cleanValue(formData.get('currentSystem')),
      website: cleanValue(formData.get('website')),

      source: attribution.source,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmContent: attribution.utmContent,
      utmTerm: attribution.utmTerm,
      fbclid: attribution.fbclid,
      gclid: attribution.gclid,

      pageUrl: window.location.href,
      referrer: document.referrer || '',
      submittedAt: new Date().toISOString()
    };

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Не вдалося надіслати заявку.');
      }

      form.reset();

      setLeadFormState({
        submitButton,
        status,
        loading: false,
        message: 'Дякуємо! Заявку отримано. Ми зв’яжемося з вами.',
        type: 'success'
      });
    } catch (error) {
      console.error('Lead form error:', error);

      setLeadFormState({
        submitButton,
        status,
        loading: false,
        message:
          'Не вдалося надіслати заявку. Спробуйте ще раз або зв’яжіться з нами напряму.',
        type: 'error'
      });
    }
  });
}

function getLeadAttribution() {
  const params = new URLSearchParams(window.location.search);

  const utmSource = cleanValue(params.get('utm_source'));
  const utmMedium = cleanValue(params.get('utm_medium'));
  const utmCampaign = cleanValue(params.get('utm_campaign'));
  const utmContent = cleanValue(params.get('utm_content'));
  const utmTerm = cleanValue(params.get('utm_term'));
  const fbclid = cleanValue(params.get('fbclid'));
  const gclid = cleanValue(params.get('gclid'));

  return {
    source: detectLeadSource({
      utmSource,
      fbclid,
      gclid,
      referrer: document.referrer
    }),
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    fbclid,
    gclid
  };
}

function detectLeadSource({ utmSource, fbclid, gclid, referrer }) {
  const normalizedUtmSource = (utmSource || '').toLowerCase();
  const normalizedReferrer = (referrer || '').toLowerCase();

  if (
    fbclid ||
    normalizedUtmSource.includes('facebook') ||
    normalizedUtmSource === 'fb' ||
    normalizedUtmSource.includes('instagram') ||
    normalizedUtmSource.includes('meta') ||
    normalizedReferrer.includes('facebook.com') ||
    normalizedReferrer.includes('instagram.com')
  ) {
    return 'Facebook / Instagram';
  }

  if (
    gclid ||
    normalizedUtmSource.includes('google') ||
    normalizedReferrer.includes('google.')
  ) {
    return 'Google';
  }

  if (utmSource) {
    return utmSource;
  }

  if (referrer) {
    try {
      return new URL(referrer).hostname;
    } catch {
      return referrer;
    }
  }

  return 'Прямий / невідомий';
}

function cleanValue(value) {
  return String(value || '').trim();
}

function setLeadFormState({
  submitButton,
  status,
  loading,
  message,
  type
}) {
  if (submitButton) {
    submitButton.disabled = loading;
    submitButton.textContent = loading
      ? 'Надсилаємо…'
      : 'Записатися на презентацію з консультантом';
  }

  if (status) {
    status.textContent = message || '';
    status.dataset.type = type || '';
  }
}
