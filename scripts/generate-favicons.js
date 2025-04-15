import { favicons } from "favicons";
import fs from "fs/promises";
import path from "path";

const source = "public/assets/images/favicon.png";
const outputDir = "public";

const configuration = {
    path: "/", // Path for overriding default icons path
    appName: "Darksun - Space Engineering Copilot",
    appShortName: "Darksun",
    appDescription: "Darksun is your Space Engineering Copilot for constellation design, mission analysis, and orbital mechanics.",
    developerName: null,
    developerURL: null,
    background: "#fff",
    theme_color: "#fff",
    icons: {
        android: true,
        appleIcon: true,
        appleStartup: false,
        favicons: true,
        windows: true,
        yandex: false
    }
};

async function main() {
    try {
        const response = await favicons(source, configuration);
        // Write images
        for (const image of response.images) {
            await fs.writeFile(path.join(outputDir, image.name), image.contents);
        }
        // Write files (manifest, browserconfig, etc)
        for (const file of response.files) {
            await fs.writeFile(path.join(outputDir, file.name), file.contents);
        }
        // Output HTML to console
        console.log("\nAdd the following to your <head>:");
        console.log(response.html.join("\n"));
    } catch (error) {
        console.error("Favicon generation failed:", error);
        process.exit(1);
    }
}

main(); 