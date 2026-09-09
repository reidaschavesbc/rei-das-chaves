@echo off
cd /d "%~dp0"
echo Ligando o site aqui no seu computador...
echo Quando abrir o navegador, use esse endereco: http://localhost:3000
echo Para desligar, feche esta janela preta.
start http://localhost:3000
npx serve -l 3000 .
pause
