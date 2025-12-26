import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Función para leer y reemplazar plantillas HTML
function renderTemplate(templatePath: string, replacements: Record<string, string>): string {
  try {
    // Leer el archivo de plantilla
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // Reemplazar todas las variables {{NOMBRE_VARIABLE}} con sus valores
    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value);
    });
    
    return template;
  } catch (err) {
    console.error('Error al renderizar la plantilla:', err);
    return `<html><body><h1>Error al cargar la plantilla</h1><p>${err}</p></body></html>`;
  }
}

// Ruta de prueba para activación
router.get('/', async (req, res) => {
  try {
    const userAgent = req.headers['user-agent'] || '';
    // Para pruebas, siempre tratamos la solicitud como si viniera de iOS
    const isIOS = true; // forzamos que siempre sea iOS para pruebas
    
    // Valores de prueba
    const activationCode = "ABC123456789";
    
    // CRITICAL: Para iOS Safari, el formato debe ser EXACTAMENTE: LPA:1$ seguido del código
    // Sin codificación, sin caracteres extra, sin modificaciones
    
    // Versión 1: URL directa estándar
    const lpaUrl = `LPA:1$${activationCode}`;
    
    // Versión 2: URL con encapsulación alternativa por si la estándar falla
    const lpaUrl2 = `LPA:1$${encodeURIComponent(activationCode.trim())}`;
    
    // Para debugging
    console.log('TEST MODE - Basic LPA URL:', lpaUrl);
    console.log('TEST MODE - Alternative LPA URL:', lpaUrl2);
    console.log('User agent:', userAgent);
    console.log('Is iOS detected:', isIOS);
    
    // Construir la ruta absoluta a la plantilla
    // En ESM, __dirname no está disponible, usamos path.resolve desde la raíz del proyecto
    const templatePath = path.resolve(
      '.',
      'server', 
      'views', 
      isIOS ? 'activate-ios.html' : 'activate-android.html'
    );
    
    console.log('Template path:', templatePath);
    
    // Verificar si la plantilla existe
    try {
      fs.accessSync(templatePath, fs.constants.R_OK);
      console.log('Template file exists and is readable');
    } catch (err) {
      console.error('Template file does not exist or is not readable:', err);
      return res.status(500).send(`<html><body><h1>Error: Template not found</h1><p>Could not find template at ${templatePath}</p></body></html>`);
    }
    
    // Reemplazos para el template
    const replacements = {
      'ACTIVATION_CODE': activationCode,
      'LPA_URL': lpaUrl,
      'LPA_URL_2': lpaUrl2
    };
    
    // Renderizar la plantilla con los valores
    const html = renderTemplate(templatePath, replacements);
    
    // Enviar la respuesta
    return res.type('html').send(html);
  } catch (error) {
    console.error('Error processing test activation request:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

export default router;