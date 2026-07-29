const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'DisciplinePage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Insert handleSaveSwap after setConflicts(activeConflicts); } catch (err) { ... } };
const handleSaveStr = `
  const handleSaveSwap = async () => {
    if (!conflictModal || !selectedSub) return;
    try {
      const newSwap = {
        date: conflictModal.date,
        duty_type: conflictModal.dutyType,
        original_nickname: conflictModal.originalNickname,
        substitute_nickname: selectedSub,
        created_at: new Date().toISOString()
      };
      
      const { error } = await supabase.from('duty_swaps').insert(newSwap);
      if (error) throw error;
      
      alert('บันทึกการเปลี่ยนเวรสำเร็จ!');
      setConflictModal(null);
      setSelectedSub('');
      loadExemptionsAndSwaps();
      loadConflictsData();
    } catch (err) {
      console.error('Error swapping duty:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    }
  };
`;

content = content.replace(
  /(const loadExemptionsAndSwaps = async \(\) => \{)/,
  handleSaveStr + '\n  $1'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully injected handleSaveSwap');
