@echo off
REM ============================================================
REM  PDF to Markdown Converter for Obsidian Second Brain
REM  Usage: convert-pdf.bat <input.pdf> [output.md]
REM         convert-pdf.bat <folder-of-pdfs> [output-folder]
REM  Options are passed through to pdfmd (--ocr auto, --export-images, etc.)
REM ============================================================

setlocal
set SCRIPT_DIR=%~dp0
set VENV=%SCRIPT_DIR%pdfmd\.venv\Scripts
set PYTHONIOENCODING=utf-8

if "%~1"=="" (
    echo Usage: convert-pdf.bat ^<input.pdf^> [output.md] [options]
    echo        convert-pdf.bat ^<folder^> [output-folder] [options]
    echo.
    echo Options:
    echo   --ocr auto        Enable OCR for scanned pages (requires Tesseract)
    echo   --ocr tesseract   Force OCR on all pages
    echo   --export-images   Export images to _assets/ folder
    echo   --page-breaks     Insert --- between pages
    echo   --stats           Show word/heading/table counts
    echo   --lang nor+eng    Set OCR language (default: eng)
    echo.
    echo Examples:
    echo   convert-pdf.bat "my-book.pdf"
    echo   convert-pdf.bat "my-book.pdf" "output.md" --stats
    echo   convert-pdf.bat "C:\PDFs\" "C:\Output\" --ocr auto
    exit /b 1
)

"%VENV%\pdfmd.exe" %*
