import { useState, useEffect } from "react";
import { read, utils } from 'xlsx';
import Drawing from 'dxf-writer';
import { save, open } from '@tauri-apps/api/dialog';
import { writeTextFile, readBinaryFile } from '@tauri-apps/api/fs';
import { listen } from '@tauri-apps/api/event'; // Для Tauri событий
import "./App.css";

// Утилитные функции
const createDrawing = (width, length) => {
  const d = new Drawing();
  d.addLayer(0, Drawing.ACI.WHITE, 'CONTINUOUS');
  d.setActiveLayer(0);
  d.drawRect(0, 0, width, length);
  return d;
};

const generateFileName = (width, length, thickness, quantity) => {
  let fileName = `${width}x${length}`;
  if (thickness) fileName += `_${thickness}мм`;
  if (quantity) fileName += `_${quantity}шт`;
  return `${fileName}.dxf`;
};

const saveDXFContent = async (dxfContent, defaultFileName) => {
  const filePath = await save({
    defaultPath: defaultFileName,
    filters: [{ name: 'DXF', extensions: ['dxf'] }]
  });
  if (filePath) {
    await writeTextFile(filePath, dxfContent);
    return filePath;
  }
  return null;
};

function App() {
  // Состояние
  const [manualData, setManualData] = useState({
    width: '',
    length: '',
    quantity: '',
    thickness: ''
  });
  const [status, setStatus] = useState('');
  const [excelFileName, setExcelFileName] = useState('');
  const [processingStatus, setProcessingStatus] = useState(null);
  const [excelData, setExcelData] = useState([]);

  // Обработчики
  const updateManualData = (field) => (e) => {
    setManualData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleManualDXFSave = async () => {
    const { width, length, quantity, thickness } = manualData;
    const w = parseFloat(width);
    const l = parseFloat(length);
    const qty = parseInt(quantity) || null;
    const thk = parseFloat(thickness) || null;

    if (isNaN(w) || isNaN(l)) {
      setStatus('Пожалуйста, введите корректные значения для длины и ширины.');
      return;
    }

    try {
      const d = createDrawing(w, l);
      const fileName = generateFileName(w, l, thk, qty);
      const filePath = await saveDXFContent(d.toDxfString(), fileName);

      if (filePath) {
        setStatus(`DXF файл сохранен: ${filePath}`);
        setManualData({ width: '', length: '', quantity: '', thickness: '' });
      }
    } catch (error) {
      setStatus(`Ошибка при сохранении файла: ${error.message}`);
      console.error('Save error:', error);
    }
  };

  const processExcelData = async (data) => {
    try {
      const workbook = read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = utils.sheet_to_json(firstSheet);
      setExcelData(rows);
      setProcessingStatus({ type: 'success', message: 'Данные загружены из Excel.' });
    } catch (error) {
      setProcessingStatus({ type: 'error', message: `Ошибка обработки файла: ${error.message}` });
      console.error('Processing error:', error);
    }
  };

  const handleFileSelect = async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
      });
      if (selected) {
        const fileName = selected.split('\\').pop();
        setExcelFileName(fileName);
        const fileData = await readBinaryFile(selected);
        await processExcelData(fileData);
      }
    } catch (error) {
      setProcessingStatus({ type: 'error', message: `Ошибка выбора файла: ${error.message}` });
      console.error('File selection error:', error);
    }
  };

  const saveSingleDXF = async (row) => {
    const width = parseFloat(row['Ширина']);
    const length = parseFloat(row['Длина']);
    const thickness = row['Толщина'] ? parseFloat(row['Толщина']) : null;
    const quantity = row['Количество'] ? parseInt(row['Количество']) : null;

    try {
      const d = createDrawing(width, length);
      const fileName = generateFileName(width, length, thickness, quantity);
      const filePath = await saveDXFContent(d.toDxfString(), fileName);

      if (filePath) {
        setStatus(`DXF файл сохранен: ${filePath}`);
      } else {
        setStatus('Ошибка при сохранении файла.');
      }
    } catch (error) {
      setStatus(`Ошибка при сохранении файла: ${error.message}`);
    }
  };

  const saveAllDXFs = async () => {
    try {
      const folderPath = await open({ directory: true, multiple: false });
      if (!folderPath) {
        setStatus('Сохранение отменено.');
        return;
      }

      let savedFilesCount = 0;
      for (const row of excelData) {
        const width = parseFloat(row['Ширина']);
        const length = parseFloat(row['Длина']);
        const thickness = row['Толщина'] ? parseFloat(row['Толщина']) : null;
        const quantity = row['Количество'] ? parseInt(row['Количество']) : null;

        if (!isNaN(width) && !isNaN(length)) {
          const d = createDrawing(width, length);
          const fileName = generateFileName(width, length, thickness, quantity);
          await writeTextFile(`${folderPath}/${fileName}`, d.toDxfString());
          savedFilesCount++;
        }
      }
      setStatus(`Все DXF файлы успешно сохранены! Количество файлов: ${savedFilesCount}.`);
    } catch (error) {
      setStatus(`Ошибка при сохранении файлов: ${error.message}`);
      console.error('Ошибка при сохранении файлов:', error);
    }
  };

  const resetExcelData = (e) => {
    e.stopPropagation();
    setExcelFileName('');
    setExcelData([]);
    setProcessingStatus(null);
    setStatus('Excel файл удален и таблица очищена.');
  };

  // Настройка Tauri drag-and-drop
  useEffect(() => {
    const unlisten = listen('tauri://file-drop', async (event) => {
      const filePaths = event.payload; // Массив путей к файлам
      console.log("Dropped files:", filePaths);
      if (filePaths.length > 0) {
        const filePath = filePaths[0];
        if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
          setExcelFileName(filePath.split('/').pop().split('\\').pop()); // Извлекаем имя файла
          const fileData = await readBinaryFile(filePath);
          await processExcelData(fileData);
        } else {
          setProcessingStatus({ type: 'error', message: 'Пожалуйста, выберите файл Excel (.xlsx или .xls)' });
        }
      }
    });

    // Очистка слушателя при размонтировании
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // Рендеринг
  return (
    <div className="container">
      <div className="manual-inputs">
        <div className="input-group">
          <div className="input-row">
            <input type="number" placeholder="Ширина" value={manualData.width} onChange={updateManualData('width')} min="1" required />
            <input type="number" placeholder="Длина" value={manualData.length} onChange={updateManualData('length')} min="1" required />
          </div>
          <div className="input-row">
            <input type="number" placeholder="Толщина (необязательно)" value={manualData.thickness} onChange={updateManualData('thickness')} min="1" />
            <input type="number" placeholder="Количество (необязательно)" value={manualData.quantity} onChange={updateManualData('quantity')} min="1" />
          </div>
          <div className="input-row">
            <button onClick={handleManualDXFSave} className="save-button">Сохранить DXF</button>
          </div>
        </div>
      </div>

      <div className="excel-section">
        <h2>Загрузка Excel файла</h2>
        <div className="excel-upload-section" onClick={handleFileSelect}>
          <div className="excel-upload-content">
            <div className="excel-icon">📊</div>
            <p className="excel-upload-text">Перетащите Excel файл сюда или кликните для выбора</p>
            {excelFileName && (
              <div className="excel-file-name">
                {excelFileName}
                <button onClick={resetExcelData} className="delete-button">Удалить</button>
              </div>
            )}
            {processingStatus && (
              <div className={`excel-processing-status ${processingStatus.type}`}>
                {processingStatus.message}
              </div>
            )}
          </div>
        </div>
      </div>

      {excelData.length > 0 && (
        <div className="data-table">
          <h2>Параметры из Excel</h2>
          <table>
            <thead>
              <tr>
                <th>Ширина</th>
                <th>Длина</th>
                <th>Толщина</th>
                <th>Количество</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {excelData.map((row, index) => (
                <tr key={index}>
                  <td>{row['Ширина']}</td>
                  <td>{row['Длина']}</td>
                  <td>{row['Толщина']}</td>
                  <td>{row['Количество']}</td>
                  <td>
                    <button onClick={() => saveSingleDXF(row)}>Сохранить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={saveAllDXFs} className="save-all-button">Сохранить все детали</button>
        </div>
      )}

      <div className="status" style={{ color: 'red' }}>{status}</div>
    </div>
  );
}

export default App;