import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("=================================================");
  console.log("   CONFIGURADOR DE DESPLIEGUE PARA LA PAPELERÍA   ");
  console.log("=================================================\n");
  console.log("Este script configurará tu base de datos en Supabase y subirá tus datos actuales");
  console.log("para que no pierdas ningún producto al desplegar en Render y Vercel.\n");

  const supabaseUrlInput = await question("1. Ingresa tu SUPABASE_URL (ej. https://xxxx.supabase.co): ");
  const supabaseUrl = supabaseUrlInput.trim().replace(/\/+$/, "");

  if (!supabaseUrl.startsWith("http")) {
    console.error("\n❌ Error: La URL de Supabase debe comenzar con http:// o https://");
    rl.close();
    return;
  }

  const supabaseKey = (await question("2. Ingresa tu SUPABASE_SERVICE_KEY (service_role): ")).trim();

  if (!supabaseKey) {
    console.error("\n❌ Error: La clave service_role es obligatoria.");
    rl.close();
    return;
  }

  const dbPath = path.resolve("core", "data", "papeleria.db");
  if (!fs.existsSync(dbPath)) {
    console.error(`\n❌ Error: No se encontró la base de datos en: ${dbPath}`);
    rl.close();
    return;
  }

  console.log("\n⏳ Conectando con Supabase y creando el bucket...");

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`
  };

  // 1. Asegurar que el bucket exista
  try {
    const bucketCheck = await fetch(`${supabaseUrl}/storage/v1/bucket/papeleria`, { headers });
    if (!bucketCheck.ok) {
      console.log("ℹ️ El bucket 'papeleria' no existe. Creándolo...");
      const bucketCreate = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "papeleria", name: "papeleria", public: true })
      });
      if (!bucketCreate.ok) {
        throw new Error(await bucketCreate.text());
      }
    }
  } catch (err) {
    console.error("\n❌ Error al conectar con Supabase. Verifica la URL y la Key.");
    console.error("Detalle:", err.message);
    rl.close();
    return;
  }

  // 2. Subir base de datos
  console.log("⏳ Subiendo base de datos actual a la nube (Supabase Storage)...");
  try {
    const dbBytes = fs.readFileSync(dbPath);
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/papeleria/papeleria.db`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "x-upsert": "true"
      },
      body: dbBytes
    });

    if (!uploadRes.ok) {
      throw new Error(await uploadRes.text());
    }

    console.log("✅ ¡Base de datos subida correctamente a Supabase!");
  } catch (err) {
    console.error("\n❌ Error al subir la base de datos.");
    console.error("Detalle:", err.message);
    rl.close();
    return;
  }

  // 3. Crear archivo .env en core
  console.log("⏳ Creando archivo de variables de entorno (.env)...");
  const envContent = `PORT=4000
HOST=0.0.0.0
JWT_SECRET=secreto-super-seguro-${Math.random().toString(36).substring(2, 15)}
SUPABASE_URL=${supabaseUrl}
SUPABASE_SERVICE_KEY=${supabaseKey}
`;

  fs.writeFileSync(path.resolve("core", ".env"), envContent);
  console.log("✅ Archivo core/.env creado localmente.");

  console.log("\n=================================================");
  console.log("   🎉 ¡CONFIGURACIÓN COMPLETADA CON ÉXITO! 🎉   ");
  console.log("=================================================\n");
  console.log("Tus datos ya están respaldados en la nube. Ahora sigue estos sencillos clics:\n");
  
  console.log("👉 PASO A: DESPLEGAR EL BACKEND EN RENDER");
  console.log("   1. Abre https://dashboard.render.com y crea un 'Web Service'.");
  console.log("   2. Selecciona tu repositorio.");
  console.log("   3. Configura:");
  console.log("      - Root Directory: core");
  console.log("      - Build Command: npm install");
  console.log("      - Start Command: node src/index.js");
  console.log("   4. Añade las siguientes Variables de Entorno (Environment Variables):");
  console.log(`      • HOST = 0.0.0.0`);
  console.log(`      • SUPABASE_URL = ${supabaseUrl}`);
  console.log(`      • SUPABASE_SERVICE_KEY = ${supabaseKey}`);
  console.log(`      • JWT_SECRET = (usa cualquier texto largo y seguro)`);
  console.log("   5. Copia la URL del backend que te dé Render (ej. https://tu-backend.onrender.com).\n");

  console.log("👉 PASO B: DESPLEGAR EL FRONTEND EN VERCEL");
  console.log("   1. Abre https://vercel.com/new e importa tu repositorio.");
  console.log("   2. Configura:");
  console.log("      - Root Directory: frontend");
  console.log("      - Framework Preset: Vite");
  console.log("   3. Añade la siguiente Variable de Entorno:");
  console.log("      • VITE_API_URL = (La URL de tu backend en Render sin barra al final)");
  console.log("   4. Haz clic en 'Deploy' y ¡listo!\n");

  rl.close();
}

main();
