# CleanVision AI — Servidor central (sin Termux)

Esta es la versión simplificada: el celular del vehículo solo abre una
página en Chrome (nada instalado), y una laptop corre un servidor liviano
que recibe los resultados y los muestra a quien quiera verlos.

## Arquitectura

```
[Webcam o cámara propia] -> [Chrome en el celular, abre /cart.html]
        (corre la IA ahí mismo, en el navegador)
                    |
         POST /report cada ~1 seg
                    v
   [Esta laptop, corriendo relay-server, mismo WiFi]
                    |
         cualquiera entra a http://<IP-laptop>:4000
                    v
        [Panel en vivo: video + estadísticas]
```

## 1. Requisitos

- Node.js en la laptop (el mismo que ya usas para los otros scripts).
- Tu modelo real exportado de Teachable Machine, ya puesto en la carpeta
  `model/` del proyecto (la misma que usan `measure_accuracy.js` y el
  panel web anterior) — `relay-server/` lee el modelo de ahí.

## 2. Instalar dependencias (solo la primera vez)

```bash
cd relay-server
npm install
```

## 3. Correr el servidor

```bash
npm start
```

Vas a ver algo como:

```
En el celular del camión, abre en Chrome:
   http://<IP-de-esta-laptop>:4000/cart.html

Para ver el panel en vivo desde cualquier otro dispositivo:
   http://<IP-de-esta-laptop>:4000
```

Para saber la IP de tu laptop: `ipconfig` (Windows) o `ifconfig` (Mac/Linux)
— busca algo como `192.168.x.x`. **Importante:** el celular y la laptop
deben estar en el mismo WiFi (o el celular conectado al hotspot de la
laptop, o viceversa).

## 4. En el celular del vehículo

1. Abre Chrome y entra a `http://<IP-laptop>:4000/cart.html`.
2. Elige la cámara en el menú desplegable — si la webcam USB está
   conectada por OTG y el celular la reconoce, va a aparecer en la lista
   junto a las cámaras propias del celular. Si no aparece, elige la
   cámara trasera del celular y listo.
3. Dale **"Iniciar"** y acepta el permiso de cámara.
4. Deja el celular montado en el vehículo así, sin tocarlo más — esta
   pantalla ya no hace falta mirarla.

## 5. En cualquier otro celular o laptop (el jurado, tú, etc.)

Conéctate al mismo WiFi y entra a `http://<IP-laptop>:4000`. Ahí verán el
video en vivo, la clasificación actual, y el resumen de sesión (lecturas
totales, % de tiempo en cada categoría, confianza promedio).

## Ventajas de este enfoque frente al de Termux

- No hay que instalar nada en el celular — solo Chrome, que ya tiene.
- No depende de que el celular reconozca la webcam por OTG: si no la
  reconoce, usan la cámara propia del celular sin cambiar nada de código.
- El procesamiento de IA corre en el navegador del celular (ya probado
  que funciona, es el mismo motor que usamos en la laptop).
- La laptop solo recibe y reenvía datos livianos (JSON + una foto chica) —
  no necesita correr el modelo.

## Notas

- Si el celular se queda sin batería o pierde el WiFi, el panel mostrará
  "sin señal del celular" automáticamente (deja de recibir reportes por
  más de 3 segundos).
- Si más adelante quieren que el panel sea visible desde fuera del WiFi
  del local (por ejemplo compartir el link con alguien de otra red),
  este mismo servidor se puede subir a un hosting gratuito (Render,
  Railway, etc.) — avísame y armamos ese despliegue, igual que en sus
  otros proyectos.
