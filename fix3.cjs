const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'DisciplinePage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const badLines = `  const [dbAttendance, setDbAttendance] = useState([]);
  const [cleanChecks, setCleanChecks] = useState([]);
  const [greetingChecks, setGreetingChecks] = useState([]);
  const [exemptions, setExemptions] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [conflictModal, setConflictModal] = useState(null);
  const [selectedSub, setSelectedSub] = useState('');`;

content = content.replace(badLines, '');

// Also, the previous missing states conflictModal and selectedSub need to be added where the other states are, around line 130
content = content.replace(
  /const \[conflicts, setConflicts\] = useState\(\[\]\);/,
  "const [conflicts, setConflicts] = useState([]);\n  const [conflictModal, setConflictModal] = useState(null);\n  const [selectedSub, setSelectedSub] = useState('');"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed duplications and states.');
