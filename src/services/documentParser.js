const fs = require('fs');
const pdfParse = require('pdf-parse');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const cheerio = require('cheerio');

class DocumentParser {
  /**
   * Parse a file based on its mime type or extension and return extracted text.
   * @param {string} filePath - Absolute path to the file
   * @param {string} mimeType - The file's mime type from multer
   * @returns {Promise<string>} - The extracted plain text
   */
  static async parseFile(filePath, mimeType) {
    try {
      if (mimeType === 'application/pdf') {
        return await this.parsePdf(filePath);
      } else if (mimeType === 'text/csv' || filePath.endsWith('.csv')) {
        return await this.parseCsv(filePath);
      } else if (mimeType === 'text/html' || filePath.endsWith('.html')) {
        return await this.parseHtml(filePath);
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        filePath.endsWith('.xlsx') ||
        filePath.endsWith('.xls')
      ) {
        return await this.parseExcel(filePath);
      } else if (mimeType === 'text/plain' || filePath.endsWith('.txt')) {
        return fs.readFileSync(filePath, 'utf8');
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (err) {
      console.error(`[DocumentParser] Error parsing file ${filePath}:`, err.message);
      throw err;
    }
  }

  static async parsePdf(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  static parseCsv(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(Object.values(data).join(' ')))
        .on('end', () => resolve(results.join('\n')))
        .on('error', (err) => reject(err));
    });
  }

  static async parseExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    let fullText = '';
    
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const html = xlsx.utils.sheet_to_html(sheet);
      const $ = cheerio.load(html);
      fullText += `--- Sheet: ${sheetName} ---\n`;
      fullText += $('body').text().replace(/\s+/g, ' ').trim() + '\n\n';
    });
    
    return fullText;
  }

  static async parseHtml(filePath) {
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(htmlContent);
    // Remove scripts and styles
    $('script, style').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  }
}

module.exports = DocumentParser;
