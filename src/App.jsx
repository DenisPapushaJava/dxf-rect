import { useState } from "react";
import { read, utils } from 'xlsx';
import Drawing from 'dxf-writer';
import { save, open } from '@tauri-apps/api/dialog';
import { writeTextFile, readBinaryFile } from '@tauri-apps/api/fs';
import "./App.css";

function App() {
    const [manualWidth, setManualWidth] = useState('');
    const [manualLength, setManualLength] = useState('');
    const [quantity, setQuantity] = useState('');
    const [thickness, setThickness] = useState('');
    const [status, setStatus] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [excelFileName, setExcelFileName] = useState('');
    const [processingStatus, setProcessingStatus] = useState(null);
    const [excelData, setExcelData] = useState([]);

    const handleManualDXFSave = async () => {
        const width = parseFloat(manualWidth);
        const length = parseFloat(manualLength);
        const qty = parseInt(quantity);
        const thick = parseFloat(thickness);

        if (isNaN(width) || isNaN(length)) {
            setStatus('Пожалуйста, введите корректные значения для длины и ширины.');
            return;
        }

        const d = new Drawing();
        d.addLayer('Rectangles', Drawing.ACI.GREEN, 'CONTINUOUS');
        d.setActiveLayer('Rectangles');
        d.drawRect(0, 0, width, length);

        let fileName = `${width}x${length}`;
        if (!isNaN(thick)) {
            fileName += `_${thick}мм`;
        }
        if (!isNaN(qty)) {
            fileName += `_${qty}шт`;
        }
        fileName += '.dxf';

        try {
            const filePath = await save({
                defaultPath: fileName,
                filters: [{
                    name: 'DXF',
                    extensions: ['dxf']
                }]
            });

            if (filePath) {
                await writeTextFile(filePath, d.toDxfString());
                setStatus(`DXF файл сохранен: ${filePath}`);
                setManualWidth('');
                setManualLength('');
                setQuantity('');
                setThickness('');
            }
        } catch (error) {
            console.error('Save error:', error);
            setStatus(`Ошибка при сохранении файла: ${error.message}`);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const processExcelData = async (data) => {
        try {
            const workbook = read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = utils.sheet_to_json(firstSheet);
            setExcelData(rows);
            setProcessingStatus({ type: 'success', message: 'Данные загружены из Excel.' });
        } catch (error) {
            console.error('Processing error:', error);
            setProcessingStatus({ type: 'error', message: `Ошибка обработки файла: ${error.message}` });
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            setExcelFileName(file.name);
            const fileData = await readBinaryFile(file.path);
            await processExcelData(fileData);
        } else {
            setProcessingStatus({ type: 'error', message: 'Пожалуйста, выберите файл Excel (.xlsx или .xls)' });
        }
    };

    const handleFileSelect = async () => {
        try {
            const selected = await open({
                filters: [{
                    name: 'Excel',
                    extensions: ['xlsx', 'xls']
                }]
            });

            if (selected) {
                setExcelFileName(selected.split('\\').pop());
                const fileData = await readBinaryFile(selected);
                await processExcelData(fileData);
            }
        } catch (error) {
            console.error('File selection error:', error);
            setProcessingStatus({ type: 'error', message: `Ошибка выбора файла: ${error.message}` });
        }
    };

    const saveDXF = async (width, length, thickness, quantity) => {
        const d = new Drawing();
        d.addLayer('Rectangles', Drawing.ACI.GREEN, 'CONTINUOUS');
        d.setActiveLayer('Rectangles');
        d.drawRect(0, 0, width, length);

        let fileName = `${width}x${length}`;
        if (thickness) fileName += `_${thickness}мм`;
        if (quantity) fileName += `_${quantity}шт`;
        fileName += '.dxf';

        const filePath = await save({
            defaultPath: fileName,
            filters: [{ name: 'DXF', extensions: ['dxf'] }]
        });

        if (filePath) {
            await writeTextFile(filePath, d.toDxfString());
            alert(`DXF файл сохранен: ${filePath}`);
            setStatus(`DXF файл сохранен: ${filePath}`);
        } else {
            alert('Ошибка при сохранении файла.');
            setStatus('Ошибка при сохранении файла.');
        }
    };

    const saveAllDXFs = async () => {
        try {
            const folderPath = await open({
                directory: true,
                multiple: false,
            });

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
                    const d = new Drawing();
                    d.addLayer('Rectangles', Drawing.ACI.GREEN, 'CONTINUOUS');
                    d.setActiveLayer('Rectangles');
                    d.drawRect(0, 0, width, length);

                    let fileName = `${width}x${length}`;
                    if (thickness) fileName += `_${thickness}мм`;
                    if (quantity) fileName += `_${quantity}шт`;
                    fileName += '.dxf';

                    const filePath = `${folderPath}/${fileName}`;
                    await writeTextFile(filePath, d.toDxfString());
                    savedFilesCount++;
                }
            }
            alert(`Все DXF файлы успешно сохранены! Количество файлов: ${savedFilesCount}. Место сохранения: ${folderPath}`);
            setStatus(`Все DXF файлы успешно сохранены! Количество файлов: ${savedFilesCount}.`);
        } catch (error) {
            console.error('Ошибка при сохранении файлов:', error);
            alert(`Ошибка при сохранении файлов: ${error.message}`);
            setStatus(`Ошибка при сохранении файлов: ${error.message}`);
        }
    };

    const handleFileDelete = (event) => {
        event.stopPropagation();
        setExcelFileName('');
        setExcelData([]);
        setProcessingStatus(null);
        setStatus('Excel файл удален и таблица очищена.');
    };

    return (
        <div className="container">
            <div className="manual-inputs">
                <h2>Ввод данных вручную</h2>
                <div className="input-group">
                    <div className="input-row">
                        <input
                            type="number"
                            placeholder="Ширина"
                            value={manualWidth}
                            onChange={(e) => setManualWidth(e.target.value)}
                        />
                        <input
                            type="number"
                            placeholder="Длина"
                            value={manualLength}
                            onChange={(e) => setManualLength(e.target.value)}
                        />
                    </div>
                    <div className="input-row">
                        <input
                            type="number"
                            placeholder="Толщина (необязательно)"
                            value={thickness}
                            onChange={(e) => setThickness(e.target.value)}
                        />
                        <input
                            type="number"
                            placeholder="Количество (необязательно)"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                        />
                    </div>
                    <div className="input-row">
                        <button onClick={handleManualDXFSave} className="save-button">
                            Сохранить DXF
                        </button>
                    </div>
                </div>
            </div>
            <div className="excel-section">
                <h2>Загрузка Excel файла</h2>
                <div 
                    className={`excel-upload-section ${isDragging ? 'dragging' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={handleFileSelect}
                >
                    <div className="excel-upload-content">
                        <div className="excel-icon">📊</div>
                        <p className="excel-upload-text">
                            Перетащите Excel файл сюда или кликните для выбора
                        </p>
                        {excelFileName && (
                            <div className="excel-file-name">
                                {excelFileName}
                                <button onClick={handleFileDelete} className="delete-button">
                                    Удалить
                                </button>
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
                                        <button onClick={() => saveDXF(
                                            parseFloat(row['Ширина']),
                                            parseFloat(row['Длина']),
                                            row['Толщина'] ? parseFloat(row['Толщина']) : null,
                                            row['Количество'] ? parseInt(row['Количество']) : null
                                        )}>
                                            Сохранить
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button onClick={saveAllDXFs} className="save-all-button">
                        Сохранить все детали
                    </button>
                </div>
            )}

            <div className="status" style={{ color: '#000' }}>
                {status}
            </div>
        </div>
    );
}

export default App; 