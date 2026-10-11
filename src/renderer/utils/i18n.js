/**
 * Internationalization (i18n) Module for LecFal Renderer Process
 *
 * Supports Spanish ('es') and English ('en') with automatic DOM translation,
 * parameterized strings, and reactive language switching.
 */

// ==================== TRANSLATIONS DICTIONARY ====================
export const TRANSLATIONS = {
  es: {
    common: {
      appTitle: 'LecFal - Tu biblioteca de mangas y comics',
      appSubtitle: 'Tu biblioteca de mangas y comics',
      active: 'Activo',
      cancel: 'Cancelar',
      save: 'Guardar',
      saveChanges: 'Guardar Cambios',
      create: 'Crear',
      close: 'Cerrar',
      done: 'Listo',
      delete: 'Eliminar',
      rename: 'Renombrar',
      add: 'Añadir',
      search: 'Buscar',
      refresh: 'Refrescar',
      clear: 'Limpiar',
      unknown: 'Desconocido',
      untitled: 'Sin título',
      chapters: 'capítulos',
      read: 'leídos',
      loading: 'Cargando...',
      error: 'Error',
      success: 'Éxito',
      all: 'Todas',
      of: 'de',
      yes: 'Sí',
      no: 'No'
    },
    nav: {
      homeTitle: 'Ir a la biblioteca',
      library: 'Biblioteca',
      history: 'Historial',
      settings: 'Ajustes',
      searchPlaceholder: 'Buscar por título, autor o tags...',
      clearSearch: 'Limpiar búsqueda',
      openAdvSearch: 'Abrir búsqueda avanzada',
      settingsTitle: 'Configuración de la biblioteca',
      scan: 'Escanear',
      scanTitle: 'Escanear cambios (archivos nuevos o modificados)',
      scanModes: 'Modos de escaneo',
      scanFast: 'Escanear cambios (Rápido)',
      scanFastDesc: 'Solo analiza archivos nuevos o modificados',
      scanFull: 'Re-escanear todo (Completo)',
      scanFullDesc: 'Fuerza el re-análisis de todos los archivos',
      scanningTitle: 'Escaneando biblioteca...',
      startingScan: 'Iniciando escaneo...',
      cancelScan: 'Cancelar escaneo'
    },
    library: {
      advSearch: 'Búsqueda Avanzada',
      closeAdvSearch: 'Cerrar búsqueda avanzada',
      title: 'Título',
      titlePlaceholder: 'Buscar por título...',
      author: 'Autor',
      group: 'Grupo / Círculo',
      parody: 'Serie / Parodia',
      tag: 'Tag / Género',
      language: 'Idioma',
      advSearchHint: 'Combina múltiples criterios para filtrar tu biblioteca.',
      clearFilters: 'Limpiar filtros',
      searchBtn: 'Buscar',
      libraryFilterTitle: 'Filtrar por biblioteca',
      libraryChipPrefix: 'Biblioteca',
      allLibraries: 'Todas',
      manageLibraries: 'Gestionar bibliotecas...',
      favorites: 'Favoritos',
      favoritesTitle: 'Mostrar solo favoritos',
      advActiveBadge: 'Filtros avanzados',
      clearAdvBadge: 'Eliminar filtros avanzados',
      sortLabel: 'Ordenar:',
      sortTitleAsc: 'Título (A - Z)',
      sortTitleDesc: 'Título (Z - A)',
      sortRecent: 'Más recientes',
      sortChapters: 'Más capítulos',
      sortOldest: 'Más antiguos',
      sizeLabel: 'Tamaño:',
      sizeSmall: 'Tamaño pequeño',
      sizeMedium: 'Tamaño mediano',
      sizeLarge: 'Tamaño grande',
      sizeSlider: 'Ajuste fino de tamaño',
      emptyNoFoldersTitle: 'Tu biblioteca está vacía',
      emptyNoFoldersDesc: 'Selecciona la carpeta raíz donde organizas tus mangas (cada manga en su subcarpeta con sus capítulos <strong>.cbz</strong> o <strong>.pdf</strong>).<br>Quedará guardada por defecto.',
      selectDefaultFolder: 'Seleccionar Carpeta por Defecto',
      emptyNoResultsTitle: 'Sin resultados coincidentes',
      emptyNoResultsDesc: 'No se encontraron mangas que coincidan con la búsqueda o filtro seleccionado.',
      emptyAdvSearchTitle: 'Búsqueda Avanzada',
      emptyAdvSearchDesc: 'Ingresa los criterios deseados arriba y pulsa <strong>Buscar</strong> para filtrar tu biblioteca.',
      capsBadge: 'caps',
      markFav: 'Marcar como favorito',
      unmarkFav: 'Quitar de favoritos'
    },
    history: {
      continueReading: 'Continuar leyendo',
      recentHistory: 'Recientemente leído',
      emptyContinueTitle: 'Sin lecturas pendientes',
      emptyContinueDesc: 'Los capítulos que empieces a leer aparecerán aquí.',
      emptyRecentTitle: 'Aún no hay historial',
      emptyRecentDesc: 'Cuando leas un capítulo, aparecerá aquí.',
      today: 'Hoy',
      yesterday: 'Ayer',
      thisWeek: 'Esta semana',
      thisMonth: 'Este mes',
      earlier: 'Anteriores',
      justNow: 'Hace un momento',
      oneMinuteAgo: 'Hace 1 minuto',
      minutesAgo: 'Hace {count} minutos',
      oneHourAgo: 'Hace 1 hora',
      hoursAgo: 'Hace {count} horas',
      daysAgo: 'Hace {count} días',
      oneWeekAgo: 'Hace 1 semana',
      weeksAgo: 'Hace {count} semanas',
      resume: 'Reanudar',
      removeFromHistory: 'Quitar del historial',
      dateUnavailable: 'Fecha no disponible'
    },
    detail: {
      backToLibrary: 'Biblioteca',
      backToHistory: 'Historial',
      backToLibraryTitle: 'Volver a la biblioteca',
      backToHistoryTitle: 'Volver al historial',
      folder: 'Carpeta',
      openFolderTitle: 'Abrir carpeta de este manga en el explorador de archivos',
      markAllRead: 'Marcar todo leído',
      markAllUnread: 'Marcar todo no leído',
      deleteManga: 'Eliminar manga',
      editTitle: 'Renombrar',
      editTitleTitle: 'Editar título del manga',
      favTitle: 'Marcar como favorito',
      authorLabel: 'Autor:',
      assignAuthor: 'Asignar autor',
      groupLabel: 'Grupo:',
      assignGroup: 'Asignar grupo o círculo',
      parodyLabel: 'Serie / Parodia:',
      assignParody: 'Asignar serie o parodia',
      languageLabel: 'Idioma:',
      assignLanguage: 'Asignar idioma',
      tagsLabel: 'Tags / Géneros:',
      addTag: 'Añadir tag',
      synopsisLabel: 'Sinopsis / Descripción:',
      editDesc: 'Editar descripción',
      noDesc: 'Sin descripción',
      descPlaceholder: 'Escribe aquí la sinopsis o descripción del manga...',
      saveDesc: 'Guardar descripción',
      startReading: 'Empezar a leer (Cap {chapter})',
      continueReading: 'Continuar leyendo (Cap {chapter})',
      readAgain: 'Leer de nuevo (Cap {chapter})',
      chaptersTitle: 'Capítulos',
      chaptersCount: '{count} capítulos',
      readCount: '{count} leídos',
      filterChapterPlaceholder: 'Filtrar capítulo...',
      sortChaptersTitle: 'Cambiar orden ascendente/descendente'
    },
    reader: {
      back: 'Volver',
      backTitle: 'Volver al detalle del manga (Esc)',
      prevChapter: 'Capítulo anterior ([)',
      nextChapter: 'Siguiente capítulo (])',
      widthToggle: 'Ajustar ancho de lectura',
      spacingToggle: 'Ajustar espacio vertical entre páginas',
      external: 'Abrir archivo en lector externo del sistema',
      fullscreen: 'Pantalla completa',
      errorTitle: 'Error al abrir el capítulo',
      errorMessage: 'No se pudo acceder al archivo en el disco.',
      errorBack: 'Volver al manga',
      errorExternal: 'Intentar con lector externo',
      footerSubtext: 'Has llegado al final de este capítulo.',
      footerBack: 'Volver al manga',
      page: 'Página',
      pages: 'páginas',
      retryPage: 'Reintentar página {num}',
      retryingPage: 'Reintentando página {num}...',
      loadingPage: 'Cargando página {num}...'
    },
    settings: {
      title: 'Configuración',
      backToLibrary: 'Biblioteca',
      backToLibraryTitle: 'Volver a la biblioteca',
      navGeneral: 'General',
      navAppearance: 'Apariencia',
      navLibrary: 'Biblioteca',
      navLibraries: 'Bibliotecas',
      navFolders: 'Carpetas',
      navCatalogs: 'Catálogos',
      navAuthors: 'Autores',
      navTags: 'Tags',
      navLanguages: 'Idiomas',
      navParodies: 'Series / Parodias',
      navGroups: 'Grupos',
      navAllCatalogs: 'Todos los catálogos',
      navData: 'Datos',
      navIgnoredValues: 'Valores ignorados',
      navStorage: 'Ubicación de datos',
      themeTitle: 'Apariencia y Tema',
      themeDesc: 'Elige el tema de la aplicación. Tu preferencia se aplica al instante y persiste al reiniciar.',
      themeDark: 'Modo Oscuro',
      themeDarkDesc: 'Tema original púrpura y negro',
      themeLight: 'Modo Claro',
      themeLightDesc: 'Estilo luminoso y limpio',
      languageTitle: 'Idioma de la Aplicación',
      languageDesc: 'Selecciona el idioma de la interfaz. Los cambios se aplican de inmediato en toda la aplicación.',
      langEsDesc: 'Español (Castellano)',
      langEnDesc: 'English (United States)',
      languageToastEs: 'Idioma cambiado a Español',
      languageToastEn: 'Language changed to English',
      foldersTitle: 'Carpetas de la Biblioteca',
      foldersDesc: 'Gestiona directorios locales, en discos externos o volúmenes montados con VeraCrypt.',
      autoPackageCbzTitle: 'Auto-empaquetar imágenes a CBZ',
      autoPackageCbzDesc: 'Al escanear, comprime carpetas o imágenes sueltas en archivos .cbz (Cap1.cbz, Cap2.cbz...) y verifica su integridad antes de limpiar los originales.',
      scanAll: 'Escanear Todo',
      scanAllTitle: 'Escanear todas las carpetas disponibles',
      addFolder: 'Añadir Carpeta',
      refreshFolders: 'Refrescar',
      refreshFoldersTitle: 'Refrescar lista de carpetas',
      librariesTitle: 'Bibliotecas',
      librariesDesc: 'Crea colecciones lógicas para organizar y agrupar tus carpetas escaneadas (ej. Manga, Cómics, Manhwa).',
      newLibrary: 'Nueva biblioteca',
      emptyLibrariesTitle: 'No hay bibliotecas creadas.',
      emptyLibrariesDesc: 'Crea una biblioteca para organizar tus carpetas escaneadas en colecciones independientes.',
      storageTitle: 'Ubicación de datos',
      storageDesc: 'Gestiona la ubicación donde LecFal almacena la base de datos SQLite, miniaturas y archivos de configuración.',
      activeMode: 'Modo Activo',
      currentStoragePath: 'Ruta actual de almacenamiento:',
      portableDataDir: 'Directorio de datos portables:',
      chooseFolder: 'Elegir carpeta…',
      storageDescText: 'Esta ubicación almacena la base de datos principal (<code style="font-family: inherit; color: #a5b4fc;">lecfal.db</code>), miniaturas de carátulas (<code style="font-family: inherit; color: #a5b4fc;">thumbnails/</code>), archivos de configuración y registros de diagnóstico.',
      storageSafeNote: 'Tus archivos y cómics originales en las carpetas de biblioteca nunca son movidos ni modificados.',
      altLocation: 'Ubicación Alternativa',
      altDestPath: 'Ruta de destino alternativa:',
      storageDestChecking: 'Comprobando disponibilidad...',
      storageDestDesc: 'Puedes cambiar entre el modo Estándar (configuración del sistema de usuario) y el modo Portable (carpeta de datos junto a la aplicación), o migrar todos tus datos de forma segura entre ambas ubicaciones.',
      switchToPortable: 'Cambiar a modo portable',
      switchToStandard: 'Cambiar a modo estándar',
      migrateData: 'Migrar datos',
      clearHistoryCardTitle: 'Limpiar historial',
      clearHistoryCardDesc: 'Elimina todos los registros de actividad de lectura del historial. Tu progreso actual (posición guardada y capítulos leídos) y tus archivos de cómics <strong>se conservarán intactos</strong>.',
      resetProgressCardTitle: 'Reiniciar historial y progreso',
      resetProgressCardDesc: 'Elimina todo el historial de lectura y restablece el progreso de todos los mangas. Los capítulos volverán a aparecer como no leídos y se perderán las posiciones guardadas. Los mangas, metadatos y archivos CBZ/PDF <strong>permanecerán intactos</strong>.',
      resetAppCardTitle: 'Restablecer aplicación',
      resetAppCardDesc: 'Restablece la base de datos de LecFal, carátulas procesadas, miniaturas, caché y preferencias internas. Tus cómics y carpetas originales <strong>nunca se eliminarán</strong>.',
      ignoredAuthorsTitle: 'Valores Detectados Ignorados',
      ignoredAuthorsDesc: 'Textos entre corchetes o paréntesis rechazados como autores (ej. temas, scans, editoriales). Puedes restaurarlos si fueron ignorados por error.'
    },
    modals: {
      editFieldTitle: 'Editar información',
      editFieldValue: 'Valor:',
      renameTitle: 'Renombrar',
      newNameLabel: 'Nuevo nombre:',
      newLibraryTitle: 'Nueva Biblioteca',
      libraryNameLabel: 'Nombre de la biblioteca:',
      libraryNamePlaceholder: 'ej. Manga, Cómics, Manhwa...',
      assignMetadataTitle: 'Asignar Metadatos',
      assignMetadataDesc: 'Selecciona los elementos que deseas asignar a este manga. Todos los valores provienen de la configuración centralizada de la biblioteca.',
      filterValuesPlaceholder: 'Filtrar valores disponibles...',
      noMetadataCreated: 'No hay elementos creados aún en la biblioteca.',
      goToSettings: 'Ir a Ajustes para crearlos',
      deleteMangaTitle: 'Eliminar manga',
      deleteMangaQuestion: '¿Qué deseas hacer con este manga?',
      removeFromLibraryTitle: 'Quitar de la biblioteca',
      removeFromLibraryDesc: 'Elimina el manga de LecFal, pero conserva sus archivos. Podrás volver a encontrarlo al escanear la carpeta.',
      deletePermanentlyTitle: 'Eliminar definitivamente',
      deletePermanentlyDesc: 'Elimina el manga de LecFal y sus archivos asociados del disco. Esta acción no se puede deshacer.',
      confirmPermanentTitle: 'Eliminar definitivamente',
      permanentWarning: 'Atención: Estos archivos se eliminarán del disco. Esta acción no se puede deshacer.',
      removeHistoryTitle: 'Quitar del historial',
      removeHistoryQuestion: '¿Deseas quitar este capítulo del historial?',
      resetMangaCheckbox: 'Reiniciar también el historial y progreso de este manga',
      resetMangaWarning: 'Se eliminará todo el historial de este manga y todos sus capítulos volverán a marcarse como no leídos (posición 0%).',
      clearHistoryTitle: 'Limpiar historial',
      clearHistoryDesc: 'Esta acción vaciará por completo la lista de «Continuar leyendo» y el registro cronológico del historial.',
      resetProgressTitle: '¿Reiniciar historial y progreso?',
      resetProgressDesc: 'Esta acción eliminará todo el historial de lectura y restablecerá el progreso de todos los mangas.',
      resetAppTitle: 'Restablecer LecFal',
      resetAppDesc: 'Esta acción restablecerá por completo el estado de LecFal. Se borrará la base de datos de la aplicación, las bibliotecas, catálogos, progreso de lectura, miniaturas y caché.',
      resetAppSafeNotice: 'Archivos seguros: Tus archivos CBZ/PDF originales y las carpetas de tus cómics NO se eliminarán.',
      resetAppRestartNotice: 'Reinicio: La aplicación se reiniciará automáticamente para inicializar una base de datos limpia.',
      deleteHistorySafeNotice: 'Tu progreso se conservará: Tu progreso de lectura permanecerá intacto. Si abres el manga de nuevo desde la Biblioteca, podrás continuar desde la posición guardada.',
      clearHistorySafeNotice: 'Progreso y archivos seguros: Tus posiciones de lectura guardadas, el estado de leído/no leído, tus mangas y tus archivos CBZ/PDF originales NO se modificarán ni eliminarán.',
      resetProgressSafeNotice: 'Los mangas, capítulos, metadatos y archivos CBZ/PDF permanecerán intactos.',
      modalFoldersTitle: 'Carpetas de la Biblioteca',
      modalFoldersDesc: 'Gestiona las carpetas escaneadas. Los mangas y capítulos encontrados permanecerán en tu biblioteca de forma permanente.',
      addAnotherFolder: 'Añadir otra carpeta'
    },
    scanner: {
      scanningChanges: 'Escaneando cambios...',
      rescanningAll: 'Re-escaneando todo...',
      scanComplete: 'Escaneo completado',
      scanCancelled: 'Escaneo cancelado',
      packagingCbz: 'Empaquetando imágenes a CBZ...'
    }
  },

  en: {
    common: {
      appTitle: 'LecFal - Your manga and comic library',
      appSubtitle: 'Your manga and comic library',
      active: 'Active',
      cancel: 'Cancel',
      save: 'Save',
      saveChanges: 'Save Changes',
      create: 'Create',
      close: 'Close',
      done: 'Done',
      delete: 'Delete',
      rename: 'Rename',
      add: 'Add',
      search: 'Search',
      refresh: 'Refresh',
      clear: 'Clear',
      unknown: 'Unknown',
      untitled: 'Untitled',
      chapters: 'chapters',
      read: 'read',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      all: 'All',
      of: 'of',
      yes: 'Yes',
      no: 'No'
    },
    nav: {
      homeTitle: 'Go to library',
      library: 'Library',
      history: 'History',
      settings: 'Settings',
      searchPlaceholder: 'Search by title, author or tags...',
      clearSearch: 'Clear search',
      openAdvSearch: 'Open advanced search',
      settingsTitle: 'Library settings',
      scan: 'Scan',
      scanTitle: 'Scan changes (new or modified files)',
      scanModes: 'Scan modes',
      scanFast: 'Scan changes (Fast)',
      scanFastDesc: 'Only analyzes new or modified files',
      scanFull: 'Re-scan all (Full)',
      scanFullDesc: 'Forces full re-analysis of all files',
      scanningTitle: 'Scanning library...',
      startingScan: 'Starting scan...',
      cancelScan: 'Cancel scan'
    },
    library: {
      advSearch: 'Advanced Search',
      closeAdvSearch: 'Close advanced search',
      title: 'Title',
      titlePlaceholder: 'Search by title...',
      author: 'Author',
      group: 'Group / Circle',
      parody: 'Series / Parody',
      tag: 'Tag / Genre',
      language: 'Language',
      advSearchHint: 'Combine multiple criteria to filter your library.',
      clearFilters: 'Clear filters',
      searchBtn: 'Search',
      libraryFilterTitle: 'Filter by library',
      libraryChipPrefix: 'Library',
      allLibraries: 'All',
      manageLibraries: 'Manage libraries...',
      favorites: 'Favorites',
      favoritesTitle: 'Show favorites only',
      advActiveBadge: 'Advanced filters',
      clearAdvBadge: 'Remove advanced filters',
      sortLabel: 'Sort by:',
      sortTitleAsc: 'Title (A - Z)',
      sortTitleDesc: 'Title (Z - A)',
      sortRecent: 'Most recent',
      sortChapters: 'Most chapters',
      sortOldest: 'Oldest',
      sizeLabel: 'Size:',
      sizeSmall: 'Small size',
      sizeMedium: 'Medium size',
      sizeLarge: 'Large size',
      sizeSlider: 'Fine size adjustment',
      emptyNoFoldersTitle: 'Your library is empty',
      emptyNoFoldersDesc: 'Select the root folder where you organize your manga (each manga in its subfolder with its <strong>.cbz</strong> or <strong>.pdf</strong> chapters).<br>It will be saved as default.',
      selectDefaultFolder: 'Select Default Folder',
      emptyNoResultsTitle: 'No matching results',
      emptyNoResultsDesc: 'No manga found matching the selected search or filter.',
      emptyAdvSearchTitle: 'Advanced Search',
      emptyAdvSearchDesc: 'Enter desired criteria above and click <strong>Search</strong> to filter your library.',
      capsBadge: 'ch.',
      markFav: 'Mark as favorite',
      unmarkFav: 'Remove from favorites'
    },
    history: {
      continueReading: 'Continue reading',
      recentHistory: 'Recently read',
      emptyContinueTitle: 'No pending reads',
      emptyContinueDesc: 'Chapters you start reading will appear here.',
      emptyRecentTitle: 'No history yet',
      emptyRecentDesc: 'When you read a chapter, it will appear here.',
      today: 'Today',
      yesterday: 'Yesterday',
      thisWeek: 'This week',
      thisMonth: 'This month',
      earlier: 'Earlier',
      justNow: 'Just now',
      oneMinuteAgo: '1 minute ago',
      minutesAgo: '{count} minutes ago',
      oneHourAgo: '1 hour ago',
      hoursAgo: '{count} hours ago',
      daysAgo: '{count} days ago',
      oneWeekAgo: '1 week ago',
      weeksAgo: '{count} weeks ago',
      resume: 'Resume',
      removeFromHistory: 'Remove from history',
      dateUnavailable: 'Date unavailable'
    },
    detail: {
      backToLibrary: 'Library',
      backToHistory: 'History',
      backToLibraryTitle: 'Back to library',
      backToHistoryTitle: 'Back to history',
      folder: 'Folder',
      openFolderTitle: 'Open this manga folder in file explorer',
      markAllRead: 'Mark all as read',
      markAllUnread: 'Mark all as unread',
      deleteManga: 'Delete manga',
      editTitle: 'Rename',
      editTitleTitle: 'Edit manga title',
      favTitle: 'Mark as favorite',
      authorLabel: 'Author:',
      assignAuthor: 'Assign author',
      groupLabel: 'Group:',
      assignGroup: 'Assign group or circle',
      parodyLabel: 'Series / Parody:',
      assignParody: 'Assign series or parody',
      languageLabel: 'Language:',
      assignLanguage: 'Assign language',
      tagsLabel: 'Tags / Genres:',
      addTag: 'Add tag',
      synopsisLabel: 'Synopsis / Description:',
      editDesc: 'Edit description',
      noDesc: 'No description',
      descPlaceholder: 'Write the manga synopsis or description here...',
      saveDesc: 'Save description',
      startReading: 'Start reading (Ch. {chapter})',
      continueReading: 'Continue reading (Ch. {chapter})',
      readAgain: 'Read again (Ch. {chapter})',
      chaptersTitle: 'Chapters',
      chaptersCount: '{count} chapters',
      readCount: '{count} read',
      filterChapterPlaceholder: 'Filter chapter...',
      sortChaptersTitle: 'Toggle ascending/descending order'
    },
    reader: {
      back: 'Back',
      backTitle: 'Back to manga details (Esc)',
      prevChapter: 'Previous chapter ([)',
      nextChapter: 'Next chapter (])',
      widthToggle: 'Adjust reading width',
      spacingToggle: 'Adjust vertical spacing between pages',
      external: 'Open file in system external reader',
      fullscreen: 'Fullscreen',
      errorTitle: 'Error opening chapter',
      errorMessage: 'Could not access the file on disk.',
      errorBack: 'Back to manga',
      errorExternal: 'Try with external reader',
      footerSubtext: 'You have reached the end of this chapter.',
      footerBack: 'Back to manga',
      page: 'Page',
      pages: 'pages',
      retryPage: 'Retry page {num}',
      retryingPage: 'Retrying page {num}...',
      loadingPage: 'Loading page {num}...'
    },
    settings: {
      title: 'Settings',
      backToLibrary: 'Library',
      backToLibraryTitle: 'Back to library',
      navGeneral: 'General',
      navAppearance: 'Appearance',
      navLibrary: 'Library',
      navLibraries: 'Libraries',
      navFolders: 'Folders',
      navCatalogs: 'Catalogs',
      navAuthors: 'Authors',
      navTags: 'Tags',
      navLanguages: 'Languages',
      navParodies: 'Series / Parodies',
      navGroups: 'Groups',
      navAllCatalogs: 'All catalogs',
      navData: 'Data',
      navIgnoredValues: 'Ignored values',
      navStorage: 'Data location',
      themeTitle: 'Appearance & Theme',
      themeDesc: 'Choose the application theme. Your preference applies instantly and persists across restarts.',
      themeDark: 'Dark Mode',
      themeDarkDesc: 'Original purple and black theme',
      themeLight: 'Light Mode',
      themeLightDesc: 'Bright and clean style',
      languageTitle: 'Application Language',
      languageDesc: 'Select the interface language. Changes apply immediately across the entire application.',
      langEsDesc: 'Spanish (Español)',
      langEnDesc: 'English (United States)',
      languageToastEs: 'Idioma cambiado a Español',
      languageToastEn: 'Language changed to English',
      foldersTitle: 'Library Folders',
      foldersDesc: 'Manage local directories, external drives, or volumes mounted with VeraCrypt.',
      autoPackageCbzTitle: 'Auto-package images to CBZ',
      autoPackageCbzDesc: 'When scanning, compresses folders or loose images into .cbz files (Cap1.cbz, Cap2.cbz...) and verifies integrity before cleaning originals.',
      scanAll: 'Scan All',
      scanAllTitle: 'Scan all available folders',
      addFolder: 'Add Folder',
      refreshFolders: 'Refresh',
      refreshFoldersTitle: 'Refresh folders list',
      librariesTitle: 'Libraries',
      librariesDesc: 'Create logical collections to organize and group your scanned folders (e.g. Manga, Comics, Manhwa).',
      newLibrary: 'New library',
      emptyLibrariesTitle: 'No libraries created.',
      emptyLibrariesDesc: 'Create a library to organize your scanned folders into independent collections.',
      storageTitle: 'Data location',
      storageDesc: 'Manage the location where LecFal stores the SQLite database, thumbnails, and configuration files.',
      activeMode: 'Active Mode',
      currentStoragePath: 'Current storage path:',
      portableDataDir: 'Portable data directory:',
      chooseFolder: 'Choose folder…',
      storageDescText: 'This location stores the primary database (<code style="font-family: inherit; color: #a5b4fc;">lecfal.db</code>), cover thumbnails (<code style="font-family: inherit; color: #a5b4fc;">thumbnails/</code>), configuration files, and diagnostic logs.',
      storageSafeNote: 'Your original comic files in library folders are never moved or modified.',
      altLocation: 'Alternate Location',
      altDestPath: 'Alternate destination path:',
      storageDestChecking: 'Checking availability...',
      storageDestDesc: 'You can switch between Standard mode (user system profile) and Portable mode (data directory next to application), or safely migrate your data between both locations.',
      switchToPortable: 'Switch to portable mode',
      switchToStandard: 'Switch to standard mode',
      migrateData: 'Migrate data',
      clearHistoryCardTitle: 'Clear history',
      clearHistoryCardDesc: 'Removes all reading activity records from history. Your current progress (saved position and read chapters) and comic files <strong>will remain intact</strong>.',
      resetProgressCardTitle: 'Reset history and progress',
      resetProgressCardDesc: 'Deletes all reading history and resets progress for all manga. Chapters will appear as unread and saved positions will be lost. Manga, metadata, and CBZ/PDF files <strong>will remain intact</strong>.',
      resetAppCardTitle: 'Reset application',
      resetAppCardDesc: 'Resets the LecFal database, processed covers, thumbnails, cache, and internal preferences. Your original comics and folders <strong>will never be deleted</strong>.',
      ignoredAuthorsTitle: 'Ignored Detected Values',
      ignoredAuthorsDesc: 'Bracketed or parenthesized texts rejected as authors (e.g. themes, scans, publishers). You can restore them if ignored by mistake.'
    },
    modals: {
      editFieldTitle: 'Edit information',
      editFieldValue: 'Value:',
      renameTitle: 'Rename',
      newNameLabel: 'New name:',
      newLibraryTitle: 'New Library',
      libraryNameLabel: 'Library name:',
      libraryNamePlaceholder: 'e.g. Manga, Comics, Manhwa...',
      assignMetadataTitle: 'Assign Metadata',
      assignMetadataDesc: 'Select items you want to assign to this manga. All values come from the centralized library settings.',
      filterValuesPlaceholder: 'Filter available values...',
      noMetadataCreated: 'No items created yet in library.',
      goToSettings: 'Go to Settings to create them',
      deleteMangaTitle: 'Delete manga',
      deleteMangaQuestion: 'What do you want to do with this manga?',
      removeFromLibraryTitle: 'Remove from library',
      removeFromLibraryDesc: 'Removes the manga from LecFal, but keeps its files. You can find it again by scanning the folder.',
      deletePermanentlyTitle: 'Delete permanently',
      deletePermanentlyDesc: 'Deletes the manga from LecFal and its associated files from disk. This action cannot be undone.',
      confirmPermanentTitle: 'Delete permanently',
      permanentWarning: 'Warning: These files will be deleted from disk. This action cannot be undone.',
      removeHistoryTitle: 'Remove from history',
      removeHistoryQuestion: 'Do you want to remove this chapter from history?',
      resetMangaCheckbox: 'Also reset history and progress for this manga',
      resetMangaWarning: 'All history for this manga will be deleted and all chapters will be marked as unread (0% position).',
      clearHistoryTitle: 'Clear history',
      clearHistoryDesc: 'This action will completely empty the "Continue reading" list and chronological history record.',
      resetProgressTitle: 'Reset history and progress?',
      resetProgressDesc: 'This action will delete all reading history and reset progress for all manga.',
      resetAppTitle: 'Reset LecFal',
      resetAppDesc: 'This action will completely reset the state of LecFal. Application database, libraries, catalogs, reading progress, thumbnails, and cache will be deleted.',
      resetAppSafeNotice: 'Safe files: Your original CBZ/PDF files and comic folders will NOT be deleted.',
      resetAppRestartNotice: 'Restart: The application will restart automatically to initialize a clean database.',
      deleteHistorySafeNotice: 'Your progress will be kept: Your reading progress will remain intact. If you open the manga again from the Library, you can continue from your saved position.',
      clearHistorySafeNotice: 'Progress and files safe: Your saved reading positions, read/unread statuses, manga, and original CBZ/PDF files will NOT be modified or deleted.',
      resetProgressSafeNotice: 'Manga, chapters, metadata, and CBZ/PDF files will remain intact.',
      modalFoldersTitle: 'Library Folders',
      modalFoldersDesc: 'Manage scanned folders. Found manga and chapters will remain in your library permanently.',
      addAnotherFolder: 'Add another folder'
    },
    scanner: {
      scanningChanges: 'Scanning changes...',
      rescanningAll: 'Re-scanning all...',
      scanComplete: 'Scan completed',
      scanCancelled: 'Scan cancelled',
      packagingCbz: 'Packaging images to CBZ...'
    }
  }
};

// ==================== STATE ====================
let currentLanguage = 'es';
const changeListeners = new Set();

/**
 * Get the currently active language code ('es' | 'en').
 * @returns {string}
 */
export function getLanguage() {
  return currentLanguage;
}

/**
 * Retrieve a translated string by dotted key path with optional parameter substitution.
 * Fallbacks to Spanish if key is not found in English, or key itself if missing in both.
 * 
 * Example: t('library.startReading', { chapter: 1 })
 * 
 * @param {string} keyPath - Dotted path, e.g. 'library.title'
 * @param {Object} [params] - Optional interpolation values, e.g. { count: 5 }
 * @returns {string}
 */
export function t(keyPath, params = {}) {
  if (!keyPath || typeof keyPath !== 'string') return '';

  const getFromDict = (dict) => {
    const parts = keyPath.split('.');
    let curr = dict;
    for (const p of parts) {
      if (curr && typeof curr === 'object' && p in curr) {
        curr = curr[p];
      } else {
        return undefined;
      }
    }
    return typeof curr === 'string' ? curr : undefined;
  };

  let str = getFromDict(TRANSLATIONS[currentLanguage]);
  if (str === undefined && currentLanguage !== 'es') {
    str = getFromDict(TRANSLATIONS.es);
  }
  if (str === undefined) {
    return keyPath;
  }

  // Parameter interpolation: {param}
  if (params && typeof params === 'object') {
    for (const [key, val] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${key}\\}`, 'g'), val !== undefined ? String(val) : '');
    }
  }

  return str;
}

/**
 * Subscribe a callback to language change events.
 * @param {Function} listener
 * @returns {Function} Unsubscribe function
 */
export function onLanguageChange(listener) {
  if (typeof listener === 'function') {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  }
  return () => {};
}

/**
 * Apply translations to DOM elements matching data-i18n attributes.
 * @param {HTMLElement|Document} [container=document]
 */
export function applyLanguageToDOM(container = document) {
  if (!container || !container.querySelectorAll) return;

  // textContent or innerHTML with HTML tags
  container.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated) {
      if (translated.includes('<') && translated.includes('>')) {
        el.innerHTML = translated;
      } else {
        el.textContent = translated;
      }
    }
  });

  // placeholder
  container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translated = t(key);
    if (translated) el.placeholder = translated;
  });

  // title
  container.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const translated = t(key);
    if (translated) el.title = translated;
  });

  // aria-label
  container.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    const translated = t(key);
    if (translated) el.setAttribute('aria-label', translated);
  });
}

/**
 * Set and apply the active language.
 * @param {string} lang - 'es' | 'en'
 * @param {boolean} [save=true] - Whether to persist to DB via IPC
 */
export async function setLanguage(lang, save = true) {
  const finalLang = (lang === 'en') ? 'en' : 'es';
  currentLanguage = finalLang;

  if (typeof document !== 'undefined') {
    document.documentElement.lang = finalLang;
    applyLanguageToDOM(document);
  }

  if (save && typeof window !== 'undefined' && window.lecfalAPI?.setSetting) {
    try {
      await window.lecfalAPI.setSetting('language', finalLang);
    } catch (err) {
      console.error('Failed to save language setting:', err);
    }
  }

  // Notify registered subscribers
  for (const listener of changeListeners) {
    try {
      listener(finalLang);
    } catch (err) {
      console.error('Error in language change listener:', err);
    }
  }
}

/**
 * Initialize i18n system with preferred language.
 * @param {string} [initialLang='es']
 */
export async function initI18n(initialLang) {
  let langToUse = initialLang;
  if (!langToUse && typeof window !== 'undefined' && window.lecfalAPI?.getSetting) {
    try {
      langToUse = await window.lecfalAPI.getSetting('language', 'es');
    } catch (_) {
      langToUse = 'es';
    }
  }
  await setLanguage(langToUse || 'es', false);
}
