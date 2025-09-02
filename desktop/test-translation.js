// Test simple pour vérifier que les méthodes de traduction sont bien exposées
// À exécuter dans la console du navigateur

console.log('=== Test des méthodes de traduction ===');

// Vérifier que window.api existe
if (typeof window.api !== 'undefined') {
    console.log('✅ window.api est disponible');
    
    // Vérifier les méthodes de traduction
    const translationMethods = [
        'toggleAutoTranslate',
        'getAutoTranslateStatus', 
        'setTargetLanguage',
        'getTargetLanguage'
    ];
    
    translationMethods.forEach(method => {
        if (typeof window.api[method] === 'function') {
            console.log(`✅ ${method} est disponible`);
        } else {
            console.log(`❌ ${method} n'est PAS disponible`);
        }
    });
    
    // Test des méthodes
    console.log('\n=== Test des appels ===');
    
    // Test getAutoTranslateStatus
    window.api.getAutoTranslateStatus()
        .then(status => {
            console.log('getAutoTranslateStatus:', status);
        })
        .catch(error => {
            console.error('Erreur getAutoTranslateStatus:', error);
        });
    
    // Test getTargetLanguage
    window.api.getTargetLanguage()
        .then(lang => {
            console.log('getTargetLanguage:', lang);
        })
        .catch(error => {
            console.error('Erreur getTargetLanguage:', error);
        });
    
} else {
    console.log('❌ window.api n\'est PAS disponible');
}

console.log('\n=== Fin du test ===');
