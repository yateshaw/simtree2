import express from 'express';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage';

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

// Endpoint for activating an eSIM through a direct link - iOS optimized version
router.get('/:employeeId/:esimId', async (req, res) => {
  try {
    const { employeeId, esimId } = req.params;
    const userAgent = req.headers['user-agent'] || '';
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    
    if (!employeeId || !esimId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request parameters'
      });
    }
    
    // Security: Validate parameters are positive integers to prevent injection
    const employeeIdNum = parseInt(employeeId);
    const esimIdNum = parseInt(esimId);
    
    if (isNaN(employeeIdNum) || employeeIdNum <= 0 || isNaN(esimIdNum) || esimIdNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }
    
    // Get eSIM and employee information using validated IDs
    const esims = await storage.getPurchasedEsims(employeeIdNum);
    const esim = esims.find(e => e.id === esimIdNum);
    
    if (!esim) {
      return res.status(404).json({
        success: false,
        message: 'eSIM not found'
      });
    }
    
    const employee = await storage.getEmployee(employeeIdNum);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get activation code from eSIM data
    // Note: La base de datos puede devolver datos con snake_case o camelCase
    // @ts-ignore - Ignorar el error de TypeScript ya que sabemos que podemos recibir snake_case
    const rawActivationCode = esim.activationCode || (esim as any).activation_code || '';
    const activationCode = typeof rawActivationCode === 'string' ? rawActivationCode.trim() : '';
    
    // CRITICAL: Para iOS Safari, el formato debe ser EXACTAMENTE: LPA:1$ seguido del código
    // Sin codificación, sin caracteres extra, sin modificaciones
    // Vamos a crear dos versiones de la URL para mayor compatibilidad
    
    // Versión 1: URL directa estándar
    const lpaUrl = `LPA:1$${activationCode}`;
    
    // Versión 2: URL con encapsulación alternativa por si la estándar falla
    const lpaUrl2 = `LPA:1$${encodeURIComponent(activationCode.trim())}`;
    
    // Para debugging
    console.log('iOS Activation - Basic LPA URL:', lpaUrl);
    console.log('iOS Activation - Alternative LPA URL:', lpaUrl2);
    
    // Seleccionar la plantilla correcta y renderizar según el tipo de dispositivo
    // En ESM, __dirname no está disponible, usamos path.resolve desde la raíz del proyecto
    const templatePath = path.resolve(
      '.',
      'server', 
      'views', 
      isIOS ? 'activate-ios.html' : 'activate-android.html'
    );
    
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
    console.error('Error processing activation request:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;