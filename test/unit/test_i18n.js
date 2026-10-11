/**
 * Unit Test Suite for LecFal i18n (Internationalization) Module
 *
 * Verifies:
 * 1. Default Spanish dictionary mappings and strings
 * 2. English dictionary mappings and strings
 * 3. Reactive language switching and listener callbacks
 * 4. Parameter substitution in translated strings
 * 5. Fallback behavior for missing keys
 * 6. DOM translation via applyLanguageToDOM (data-i18n, title, placeholder, aria-label)
 */

const assert = require('assert');

async function runTests() {
  console.log('=== Running LecFal i18n Unit Tests ===\n');

  // Dynamic import of ES Module
  const {
    t,
    getLanguage,
    setLanguage,
    initI18n,
    applyLanguageToDOM,
    onLanguageChange,
    TRANSLATIONS
  } = await import('../../src/renderer/utils/i18n.js');

  // 1. Initial State & Defaults
  console.log('Test 1: Default language is Spanish ("es")');
  await setLanguage('es', false);
  assert.strictEqual(getLanguage(), 'es', 'Default language must be "es"');
  assert.strictEqual(t('common.save'), 'Guardar');
  assert.strictEqual(t('nav.library'), 'Biblioteca');
  assert.strictEqual(t('nav.history'), 'Historial');
  assert.strictEqual(t('settings.navAppearance'), 'Apariencia');
  assert.strictEqual(t('history.today'), 'Hoy');
  assert.strictEqual(t('history.yesterday'), 'Ayer');
  console.log('  ✓ Passed');

  // 2. Language Switch to English
  console.log('Test 2: Language switch to English ("en")');
  let notifiedLang = null;
  const unsubscribe = onLanguageChange((lang) => {
    notifiedLang = lang;
  });

  await setLanguage('en', false);
  assert.strictEqual(getLanguage(), 'en', 'Active language must be "en"');
  assert.strictEqual(notifiedLang, 'en', 'Listener must receive "en"');
  assert.strictEqual(t('common.save'), 'Save');
  assert.strictEqual(t('nav.library'), 'Library');
  assert.strictEqual(t('nav.history'), 'History');
  assert.strictEqual(t('settings.navAppearance'), 'Appearance');
  assert.strictEqual(t('history.today'), 'Today');
  assert.strictEqual(t('history.yesterday'), 'Yesterday');
  console.log('  ✓ Passed');

  // 3. Parameter Interpolation
  console.log('Test 3: Parameter interpolation');
  // In English
  assert.strictEqual(t('history.minutesAgo', { count: 12 }), '12 minutes ago');
  assert.strictEqual(t('detail.startReading', { chapter: 3 }), 'Start reading (Ch. 3)');
  assert.strictEqual(t('detail.chaptersCount', { count: 42 }), '42 chapters');

  // Switch back to Spanish
  await setLanguage('es', false);
  assert.strictEqual(getLanguage(), 'es');
  assert.strictEqual(t('history.minutesAgo', { count: 12 }), 'Hace 12 minutos');
  assert.strictEqual(t('detail.startReading', { chapter: 3 }), 'Empezar a leer (Cap 3)');
  assert.strictEqual(t('detail.chaptersCount', { count: 42 }), '42 capítulos');
  console.log('  ✓ Passed');

  // 4. Fallback Handling
  console.log('Test 4: Fallback handling for missing keys');
  assert.strictEqual(t('nonexistent.key.name'), 'nonexistent.key.name', 'Should fallback to key if not found');
  assert.strictEqual(t(''), '');
  assert.strictEqual(t(null), '');
  console.log('  ✓ Passed');

  // 5. DOM Translation with Mock Container
  console.log('Test 5: applyLanguageToDOM with mock elements');
  const mockElements = {
    textNode: {
      tagName: 'SPAN',
      getAttribute: (attr) => (attr === 'data-i18n' ? 'nav.settings' : null),
      textContent: 'Ajustes'
    },
    inputNode: {
      tagName: 'INPUT',
      getAttribute: (attr) => {
        if (attr === 'data-i18n-placeholder') return 'nav.searchPlaceholder';
        if (attr === 'data-i18n-title') return 'nav.settingsTitle';
        return null;
      },
      placeholder: '',
      title: ''
    },
    buttonNode: {
      tagName: 'BUTTON',
      getAttribute: (attr) => (attr === 'data-i18n-aria-label' ? 'common.close' : null),
      setAttribute: function (attr, val) { this[attr] = val; }
    }
  };

  const mockContainer = {
    querySelectorAll: (selector) => {
      if (selector === '[data-i18n]') return [mockElements.textNode];
      if (selector === '[data-i18n-placeholder]') return [mockElements.inputNode];
      if (selector === '[data-i18n-title]') return [mockElements.inputNode];
      if (selector === '[data-i18n-aria-label]') return [mockElements.buttonNode];
      return [];
    }
  };

  // Switch to English and translate mock DOM
  await setLanguage('en', false);
  applyLanguageToDOM(mockContainer);

  assert.strictEqual(mockElements.textNode.textContent, 'Settings');
  assert.strictEqual(mockElements.inputNode.placeholder, 'Search by title, author or tags...');
  assert.strictEqual(mockElements.inputNode.title, 'Library settings');
  assert.strictEqual(mockElements.buttonNode['aria-label'], 'Close');

  // Switch to Spanish and translate mock DOM
  await setLanguage('es', false);
  applyLanguageToDOM(mockContainer);

  assert.strictEqual(mockElements.textNode.textContent, 'Ajustes');
  assert.strictEqual(mockElements.inputNode.placeholder, 'Buscar por título, autor o tags...');
  assert.strictEqual(mockElements.inputNode.title, 'Configuración de la biblioteca');
  assert.strictEqual(mockElements.buttonNode['aria-label'], 'Cerrar');
  console.log('  ✓ Passed');

  // 6. Completeness of English Dictionary Keys vs Spanish
  console.log('Test 6: Completeness of English Dictionary Keys vs Spanish');
  function getDeepKeys(obj, prefix = '') {
    return Object.keys(obj).reduce((res, el) => {
      if (Array.isArray(obj[el])) {
        return res;
      } else if (typeof obj[el] === 'object' && obj[el] !== null) {
        return [...res, ...getDeepKeys(obj[el], prefix + el + '.')];
      }
      return [...res, prefix + el];
    }, []);
  }

  const esKeys = getDeepKeys(TRANSLATIONS.es);
  const enKeys = new Set(getDeepKeys(TRANSLATIONS.en));

  const missingInEn = esKeys.filter(k => !enKeys.has(k));
  if (missingInEn.length > 0) {
    console.warn('Warning: Missing English keys for:', missingInEn);
  }
  assert.strictEqual(missingInEn.length, 0, `All Spanish keys must exist in English. Missing: ${missingInEn.join(', ')}`);
  console.log(`  ✓ Passed (${esKeys.length} keys verified 100% matched)`);

  unsubscribe();
  // Ensure we leave default language as Spanish
  await setLanguage('es', false);

  console.log('\n=== All i18n Unit Tests Passed Successfully! ===');
}

runTests().catch(err => {
  console.error('\n❌ i18n Test Failed:', err);
  process.exit(1);
});
