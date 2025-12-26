import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

const router = Router();

// Route to handle eSIM activation
router.get('/:employeeId/:esimId', async (req, res) => {
  try {
    const { employeeId, esimId } = z.object({
      employeeId: z.string().transform(val => parseInt(val, 10)),
      esimId: z.string().transform(val => parseInt(val, 10))
    }).parse(req.params);

    console.log(`Processing activation for employee ${employeeId} and eSIM ${esimId}`);

    // Get the eSIM details using raw SQL through the sql tag for more control
    const esims = await db.execute(
      sql`SELECT * FROM ${schema.purchasedEsims} 
          WHERE id = ${esimId} AND employee_id = ${employeeId}`
    );
    
    const [esim] = esims.rows;

    if (!esim) {
      return res.status(404).json({
        success: false,
        message: 'eSIM not found'
      });
    }

    if (esim.status === 'activated') {
      return res.status(400).json({
        success: false,
        message: 'eSIM is already activated'
      });
    }

    // Create LPA URL for eSIM installation - format must be EXACT per Apple specs
    // Note: SQL query returns snake_case props but the schema uses camelCase
    const rawActivationCode = esim.activation_code || esim.activationCode || '';
    const activationCode = typeof rawActivationCode === 'string' ? rawActivationCode.trim() : '';
    
    // CRITICAL: iOS Safari tiene requisitos muy específicos para protocolos personalizados
    // Si el código de activación incluye caracteres especiales, es posible que Safari lo rechace
    // Vamos a crear dos versiones de la URL: una estándar y una escapada
    
    // Versión 1: URL directa estándar (formato básico preferido por Apple)
    const lpaUrl = `LPA:1$${activationCode}`;
    
    // Versión 2: URL con encapsulación alternativa por si la estándar falla
    // Esta forma a veces funciona cuando la estándar falla
    const lpaUrl2 = `LPA:1$${encodeURIComponent(activationCode.trim())}`;
    
    // Para debugging
    console.log('LPA URL Básica:', lpaUrl);
    console.log('LPA URL Alternativa:', lpaUrl2);

    // Serve an HTML page that will trigger the eSIM installation
    // Note: We need a very streamlined and simple HTML for best compatibility with iOS Safari
    res.type('html').send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta http-equiv="Content-Security-Policy" content="default-src * 'self' 'unsafe-inline' LPA:; script-src * 'self' 'unsafe-inline'; connect-src * 'self'; img-src * data: blob: 'self'; frame-src *; style-src * 'self' 'unsafe-inline';">
    <title>Activación de eSIM</title>
    <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            line-height: 1.5;
            margin: 0;
            padding: 20px;
            text-align: center;
            background-color: #f5f5f5;
            -webkit-text-size-adjust: 100%;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 { color: #333; margin-bottom: 20px; }
          p { color: #666; margin-bottom: 20px; }
          button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            -webkit-appearance: none;
            -webkit-tap-highlight-color: transparent;
            font-weight: bold;
            width: 100%;
            max-width: 300px;
            margin: 0 auto;
            display: block;
          }
          #status-message {
            margin-top: 20px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 8px;
            color: #333;
            display: none;
          }
          .browser-info {
            margin-top: 30px;
            font-size: 14px;
            color: #666;
            text-align: left;
            background-color: #fffde7;
            border-radius: 8px;
            padding: 15px;
            border-left: 4px solid #ffd600;
          }
          .browser-info ul {
            padding-left: 20px;
            margin: 10px 0;
          }
          .direct-link {
            display: inline-block;
            margin: 20px 0;
            font-size: 14px;
            text-decoration: none;
            color: #1a73e8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Activación de eSIM</h1>
          <p>Haga clic en el botón para instalar su perfil de eSIM en este dispositivo.</p>
          
          <button onclick="activateESIM()" id="activation-button">Instalar Perfil eSIM</button>
          
          <div id="status-message"></div>
          
          <!-- Enlaces directos como fallback -->
          <div style="margin: 20px 0; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
            <p style="font-weight: bold; margin-bottom: 10px;">Opciones de activación manual:</p>
            <a href="${lpaUrl}" class="direct-link" id="direct-link-1">Opción 1: Activar eSIM directamente</a>
            <br>
            <a href="${lpaUrl2}" class="direct-link" id="direct-link-2">Opción 2: Activar eSIM (formato alternativo)</a>
            
            <div style="margin-top: 15px; padding: 10px; background-color: #e8f4fc; border-radius: 5px;">
              <p style="margin: 0; font-size: 14px;">Si ninguna opción funciona, puede copiar este código manualmente:</p>
              <div style="display: flex; align-items: center; margin-top: 10px;">
                <code id="activation-code" style="flex: 1; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; overflow-x: auto;">${activationCode}</code>
                <button onclick="copyActivationCode()" style="margin-left: 10px; padding: 8px 12px; background: #4285F4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Copiar</button>
              </div>
              <script>
                function copyActivationCode() {
                  const codeEl = document.getElementById('activation-code');
                  navigator.clipboard.writeText(codeEl.textContent).then(() => {
                    alert('Código copiado al portapapeles');
                  });
                }
              </script>
            </div>
          </div>
          
          <!-- Browser compatibility notice -->
          <div class="browser-info">
            <p><strong>⚠️ Importante:</strong> Para mejores resultados:</p>
            <ul>
              <li><strong>iPhone/iPad:</strong> 
                <ul>
                  <li>Use el navegador <strong>Safari</strong> (requerido para activación)</li>
                  <li>Si ve "Safari no puede abrir la página porque la dirección no es válida", intente las opciones manuales abajo</li>
                </ul>
              </li>
              <li><strong>Android:</strong>
                <ul>
                  <li>Asegúrese de tener datos móviles activados</li>
                  <li>Verifique el panel de notificaciones si no ocurre nada</li>
                </ul>
              </li>
            </ul>
          </div>
          
          <!-- Instrucciones detalladas para activación manual en iOS -->
          <div style="margin-top: 25px; padding: 20px; border: 1px solid #ffd600; border-radius: 8px; background-color: #fffef3;">
            <h3 style="margin-top: 0; color: #333;">Instrucciones para activación manual en iPhone</h3>
            
            <ol style="padding-left: 20px; line-height: 1.6;">
              <li><strong>Copie su código de activación:</strong> Utilice el botón "Copiar" arriba para copiar su código.</li>
              <li><strong>Vaya a Configuración:</strong> Abra la aplicación "Ajustes" en su iPhone.</li>
              <li><strong>Seleccione "Datos móviles":</strong> Desplácese hacia abajo y toque esta opción.</li>
              <li><strong>Agregue un plan:</strong> Busque la opción "Añadir plan de datos" o similar.</li>
              <li><strong>Introduzca manualmente:</strong> Elija "Introducir detalles manualmente" cuando se le solicite.</li>
              <li><strong>Pegue el código:</strong> Pegue el código de activación que copió anteriormente.</li>
              <li><strong>Complete el proceso:</strong> Siga las instrucciones en pantalla para finalizar la activación.</li>
            </ol>
            
            <p style="margin-top: 15px; font-style: italic;">Nota: Si experimenta problemas, contacte a su administrador para obtener asistencia adicional.</p>
          </div>
        </div>
        <script>
          function activateESIM() {
            // CRITICAL PROTOCOL INFO:
            // For iOS Safari, the LPA protocol format must be EXACTLY: LPA:1$<code>
            // No URL encoding, no modifications, and must be navigated to directly
            // See: https://developer.apple.com/documentation/bundleresources/information_property_list/lsapplicationqueriesschemes
            
            try {
              // Detect device type and browser
              const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
              const isSafari = /Version\/[\d\.]+.*Safari/i.test(navigator.userAgent);
              
              // The exact LPA URL without any modifications
              const lpaProtocolUrl = "${lpaUrl}";
              
              // Show status to user
              const statusEl = document.getElementById('status-message');
              statusEl.textContent = 'Iniciando activación de eSIM...';
              statusEl.style.display = 'block';
              
              console.log('Device detection: iOS=' + isIOS + ', Safari=' + isSafari);
              console.log('Activation URL: ' + lpaProtocolUrl);
                            
              if (isIOS) {
                // iOS SPECIFIC APPROACH - MOST STRICT FORMAT REQUIREMENTS
                if (isSafari) {
                  // SAFARI IS REQUIRED FOR IOS PROTOCOL HANDLERS
                  statusEl.textContent = 'Abriendo configuración de eSIM...';
                  
                  // PARA SAFARI: Intenta varios métodos para asegurar que el proceso de activación funcione
                  statusEl.innerHTML += '<br>Intentando método 1...';
                  
                  // Estrategia 1: Navegación directa (método estándar)
                  window.location.href = lpaProtocolUrl;
                  
                  // Estrategia 2: Si el método 1 falla, prueba con un iframe después de un pequeño retraso
                  setTimeout(() => {
                    statusEl.innerHTML += '<br>Intentando método 2...';
                    try {
                      // Intenta usar un iframe (menos confiable pero a veces funciona)
                      const iframe = document.createElement('iframe');
                      iframe.style.display = 'none';
                      iframe.src = "${lpaUrl2}"; // Usar URL alternativa  
                      document.body.appendChild(iframe);
                      
                      // Limpiar iframe
                      setTimeout(() => {
                        document.body.removeChild(iframe);
                      }, 1000);
                    } catch (e) {
                      console.error("Error en estrategia 2:", e);
                    }
                  }, 1000);
                  
                  // Estrategia 3: Método de enlace directo como último recurso
                  setTimeout(() => {
                    statusEl.innerHTML += '<br>Intentando método 3...';
                    try {
                      // Intenta con un enlace directo
                      const a = document.createElement('a');
                      a.href = "${lpaUrl2}";
                      a.style.display = 'none';
                      a.rel = 'noopener';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    } catch (e) {
                      console.error("Error en estrategia 3:", e);
                    }
                  }, 2000);
                } else {
                  // NOT SAFARI - SHOW WARNING
                  statusEl.textContent = 'Para dispositivos iOS, por favor abra este enlace en Safari para mejor compatibilidad.';
                  
                  // Create button to copy URL to clipboard
                  const copyButton = document.createElement('button');
                  copyButton.innerText = 'Copiar enlace de activación';
                  copyButton.style.marginTop = '10px';
                  copyButton.style.padding = '8px 16px';
                  copyButton.style.backgroundColor = '#3B82F6';
                  copyButton.onclick = function() {
                    navigator.clipboard.writeText(lpaProtocolUrl).then(() => {
                      copyButton.innerText = '¡Enlace copiado!';
                      setTimeout(() => {
                        copyButton.innerText = 'Copiar enlace de activación';
                      }, 2000);
                    });
                  };
                  statusEl.appendChild(document.createElement('br'));
                  statusEl.appendChild(copyButton);
                }
              } else {
                // ANDROID AND OTHER DEVICES
                statusEl.textContent = 'Abriendo gestor de eSIM...';
                
                // For Android, we try direct navigation
                try {
                  window.location.href = lpaProtocolUrl;
                } catch (e) {
                  console.error('Navigation error:', e);
                  statusEl.textContent = 'Error al abrir el gestor de eSIM. Por favor, verifique que su dispositivo es compatible con eSIM.';
                }
              }
              
              // Update message after a delay
              setTimeout(() => {
                // Don't overwrite any error messages that might have been set
                if (statusEl.textContent.indexOf('Error') === -1) {
                  statusEl.innerHTML = 'La activación de eSIM ha sido iniciada.<br>Si no ocurre nada después de unos segundos, intente nuevamente o compruebe la configuración de su dispositivo.';
                }
              }, 3000);
              
            } catch (error) {
              console.error('Activation error:', error);
              document.getElementById('status-message').textContent = 'Error activando eSIM: ' + (error.message || 'Error desconocido');
              document.getElementById('status-message').style.display = 'block';
            }
          }

          // Add a small delay before auto-triggering to ensure the page is fully loaded
          if (window.location.hash === '#auto') {
            setTimeout(() => {
              activateESIM();
            }, 500);
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error processing activation request:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;