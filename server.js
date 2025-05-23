require('dotenv').config();
const express = require("express");
const mysql = require("mysql2");
const jwt = require("jsonwebtoken");
const { sendMail } = require('./mailjet');
process.env.TZ = 'America/Santiago';

const app = express();
const port = 3000;
const SECRET_KEY = process.env.SECRET_KEY || "grupo_3";

app.use(express.json());
app.use(express.static("public"));


const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

connection.connect(err => {
    if (err) {
        console.error("Error conectando a MySQL:", err);
        return;
    }
    console.log("Conectado a MySQL correctamente");
});


app.post("/login", (req, res) => {
    const { username, password } = req.body;


    const query = "SELECT * FROM admin WHERE username = ?";
    connection.query(query, [username], (err, results) => {
        if (err) {
            console.error("Error al consultar la base de datos:", err);
            return res.status(500).json({ message: "Error en el servidor" });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: "Usuario o contraseña incorrectos" });
        }

        const user = results[0];


        if (password !== user.password) {
            return res.status(401).json({ message: "Usuario o contraseña incorrectos" });
        }

        // Generar un token JWT
        const token = jwt.sign({ username: user.username }, SECRET_KEY, { expiresIn: "1h" });
        res.json({ token });
    });
});


app.post("/login-docente", (req, res) => {
    const { rut_docente, password } = req.body;


    const query = "SELECT * FROM docente WHERE rut_docente = ?";
    connection.query(query, [rut_docente], (err, results) => {
        if (err) {
            console.error("Error al consultar la base de datos:", err);
            return res.status(500).json({ message: "Error en el servidor" });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: "Usuario o contraseña incorrectos" });
        }

        const user = results[0];


        if (password !== user.password) {
            return res.status(401).json({ message: "Usuario o contraseña incorrectos" });
        }

        // Generar un token JWT
        const token = jwt.sign({ username: user.rut_docente }, SECRET_KEY, { expiresIn: "1h" });
        res.json({ token });
    });
});



// Middleware para proteger rutas
function authenticateToken(req, res, next) {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) return res.status(403).json({ message: "Acceso denegado" });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.usuario = decoded; // Aquí guardamos los datos del token
        next();
    } catch (error) {
        return res.status(403).json({ message: "Token inválido o expirado" });
    }
}

//_JWT

//Ruta para obtener el total de docentes en el jardin
app.get('/api/docentes/count', (req, res) => {
    const query = 'SELECT COUNT(*) AS total FROM docente';

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error en la consulta:', err);
            return res.status(500).json({ error: 'Error en la base de datos' });
        }

        const totalDocentes = results[0].total;
        res.json({ totalDocentes });
        console.log("cantidad de profesores:" + totalDocentes);
    });
});

//Ruta para obtener el total de alumnos en el jardin
app.get('/api/alumnos/count', (req, res) => {
    const query = 'SELECT COUNT(*) AS total FROM alumno';
    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error en la consulta:', err);
            return res.status(500).json({ error: 'Error en la base de datos' });
        }

        const totalAlumnos = results[0].total;
        res.json({ totalAlumnos });
        console.log("cantidad de alumnos:" + totalAlumnos);
    });
});



// Ruta protegida de ejemplo
app.get("/registro", authenticateToken, (req, res) => {
    res.json({ message: "Acceso permitido", user: req.user });
});



app.post('/api/docentes', (req, res) => {
    const docente = req.body;
    console.log("Datos recibidos para docente:", docente);

    // Validación de campos requeridos
    if (!docente.rutDocente || !docente.nombreDocente || !docente.apellidoDocente ||
        !docente.fonoDocente || !docente.emailDocente || !docente.cursoDocente) {
        return res.status(400).send({
            message: "Los campos RUT, nombre, apellido, teléfono, curso y email son obligatorios"
        });
    }

    // Validación del formato del RUT
    if (!docente.rutDocente.includes('-')) {
        return res.status(400).send({
            message: "El RUT debe incluir guión (-). Ejemplo: 12345678-9"
        });
    }

    console.log("Ingresa los datos del docente a la query");
    const query = "INSERT INTO docente (rut_docente, password, nombre, apellido, fono, email, direccion, curso_id_curso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    connection.query(query, [
        docente.rutDocente,
        docente.password,
        docente.nombreDocente,
        docente.apellidoDocente,
        docente.fonoDocente,
        docente.emailDocente,
        docente.direccionDocente || null,
        docente.cursoDocente
    ], (err, results) => {
        if (err) {
            if (err.message.includes('Duplicate entry')) {
                return res.status(400).send({
                    message: "El docente con RUT " + docente.rutDocente + " ya está registrado en el sistema"
                });
            }
            console.error("Error al insertar en la tabla docente:", err);
            return res.status(500).send({ message: "Error al registrar el docente" });
        }
        console.log("Docente registrado exitosamente:", results);
        res.status(201).send({ message: 'Docente registrado exitosamente' });
    });
});

app.post('/api/alumnos', (req, res) => {
    const alumno = req.body;

    console.log("Datos recibidos para alumno:", alumno);

    // Validación básica de campos requeridos
    if (!alumno.rutAlumno || !alumno.nombreAlumno || !alumno.apellidoAlumno ||
        !alumno.cursoAlumno || !alumno.rutApoderadoUno || !alumno.nombreApoderadoUno ||
        !alumno.fono1 || !alumno.email1) {
        return res.status(400).send({
            message: "Los campos RUT, nombre, apellido, curso, y datos del apoderado principal (RUT, nombre, teléfono y email) son obligatorios"
        });
    }

    // Primero verificamos que el curso existe
    const checkCursoQuery = "SELECT id_curso FROM curso WHERE id_curso = ?";
    connection.query(checkCursoQuery, [alumno.cursoAlumno], (err, results) => {
        if (err) {
            console.error("Error al verificar el curso:", err);
            return res.status(500).send({ message: "Error al verificar el curso" });
        }

        if (results.length === 0) {
            return res.status(400).send({ message: "El curso especificado no existe" });
        }

        // Si el curso existe, procedemos con el registro
        const query = "INSERT INTO alumno (rut_alumno, nombre, apellido, observacion, curso_id_curso, rut_apoderado_uno, nombre_apoderado_uno, rut_apoderado_dos, nombre_apoderado_dos, fono1, fono2, email1, email2, direccion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        connection.query(query, [
            alumno.rutAlumno,
            alumno.nombreAlumno,
            alumno.apellidoAlumno,
            alumno.observacionAlumno || null,
            alumno.cursoAlumno,
            alumno.rutApoderadoUno,
            alumno.nombreApoderadoUno,
            alumno.rutApoderadoDos || null,
            alumno.nombreApoderadoDos || null,
            alumno.fono1,
            alumno.fono2 || null,
            alumno.email1,
            alumno.email2 || null,
            alumno.direccion || null
        ], (err, results) => {
            if (err) {
                console.error("Error al insertar en la tabla alumno:", err);
                return res.status(500).send({ message: "Error al registrar el alumno" });
            }
            res.status(201).send({ message: 'Alumno registrado exitosamente' });
        });
    });
});


//aqui traigo el token para verificar que la profesora tenga los permisos, y consultamos que traiga todos los alumnos que calcen con su curso.
app.get('/api/alumnos', authenticateToken, (req, res) => {
    const rut_docente = req.usuario.username; // o req.usuario.rut_docente según el token

    const query = `
        SELECT a.rut_alumno, a.nombre, a.apellido, a.curso_id_curso
        FROM alumno a
        INNER JOIN docente d ON a.curso_id_curso = d.curso_id_curso
        WHERE d.rut_docente = ?
    `;

    connection.query(query, [rut_docente], (err, results) => {
        if (err) {
            console.error('Error al obtener los alumnos:', err);
            return res.status(500).json({ error: 'Error al obtener los alumnos' });
        }
        res.json(results);
    });
});


//traer al alumno y su informacion por rut:
app.get('/api/alumnos/:rut', (req, res) => {
    const { rut } = req.params; //tomando el rut de la url
    const query = 'SELECT rut_alumno, nombre, apellido, curso_id_curso, nombre_apoderado_uno, nombre_apoderado_dos, fono1, fono2, email1 ,email2, direccion FROM alumno WHERE rut_alumno = ?';

    connection.query(query, [rut], (err, results) => {
        if (err) {
            console.error('Error al obtener el alumno: ', err);
            return res.status(500).json({ error: 'Error al obtener información del alumno' });
        }
        //cuando no encuentre al alumno
        if (results.length === 0) {
            return res.status(404).json({ error: 'Alumno no encontrado' });
        }
        //si todo sale bien, devuelve al alumno encontrado
        res.json(results[0]);
        // Esto imprime los detalles del alumno encontrado (información en consola)
        console.log("Alumno y su información: ", results[0]);

    });
});

app.get('/api/alumno/asistencia/:estado', (req, res) => {
    const { estado } = req.params;
    console.log("la denis estuvo aqui 1");

    const today = new Date();

    // Ajuste de la zona horaria manual (para la zona horaria de Chile)
    const offset = -3;  // Zona horaria de Chile: UTC-3
    today.setHours(today.getHours() + offset);
    
    const todayInChile = today.toISOString().split('T')[0];

    console.log(todayInChile);
    // Consulta SQL con la fecha como texto
    const query = `
        SELECT DISTINCT a.rut_alumno, a.nombre, a.apellido, a.curso_id_curso AS curso, d.estado
        FROM alumno a
        INNER JOIN ingreso d ON a.curso_id_curso = d.id_curso
        WHERE d.estado = ?
          AND DATE(d.hora) = ?
    `;

    console.log("la denis estuvo aqui 2");

    // Ejecutar la consulta
    connection.query(query, [estado, todayInChile], (err, results) => {
        if (err) {
            console.error('Error al obtener los alumnos:', err);
            return res.status(500).json({ error: 'Error al obtener los alumnos' });
        }
        res.json(results);
    });
});






app.get('/api/docentes', (req, res) => {
    const query = 'SELECT rut_docente, nombre, apellido, fono, email, curso_id_curso FROM docente';
    connection.query(query, (err, results) => {

        if (err) {
            console.error('Error al obtener los docentes:', err);
            return res.status(500).json({ error: 'Error al obtener los docentes' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: "No se encontraron docentes registrados" });
        }

        return res.status(200).json(results);
    });

});

app.put('/api/docentes/:rut', (req, res) => {
    const rutDocente = req.params.rut;
    const docente = req.body;
    console.log("Datos recibidos para actualizar al docente:", docente);

    // Validación de campos requeridos
    if (!docente.nombreDocente || !docente.apellidoDocente ||
        !docente.fonoDocente || !docente.emailDocente || !docente.cursoDocente) {
        return res.status(400).send({
            message: "Los campos nombre, apellido, teléfono, curso y email son obligatorios"
        });
    }

    console.log("Actualizando datos del docente con RUT:", rutDocente);
    const query = `
        UPDATE docente 
        SET 
            nombre = ?, 
            apellido = ?, 
            fono = ?, 
            email = ?, 
            direccion = ?, 
            curso_id_curso = ? 
        WHERE rut_docente = ?`;

    connection.query(query, [
        docente.nombreDocente,
        docente.apellidoDocente,
        docente.fonoDocente,
        docente.emailDocente,
        docente.direccionDocente || null,
        docente.cursoDocente,
        rutDocente
    ], (err, results) => {
        if (err) {
            console.error("Error al actualizar el docente:", err);
            return res.status(500).send({ message: "Error al actualizar el docente" });
        }

        if (results.affectedRows === 0) {
            return res.status(404).send({ message: "Docente no encontrado" });
        }

        console.log("Docente actualizado exitosamente:", results);
        res.status(200).send({ message: 'Docente actualizado exitosamente' });
    });
});

app.delete('/api/docentes/:rut', (req, res) => {
    const rutDocente = req.params.rut;
    console.log("Eliminando docente con RUT:", rutDocente);

    const query = "DELETE FROM docente WHERE rut_docente = ?";

    connection.query(query, [rutDocente], (err, results) => {
        if (err) {
            console.error("Error al eliminar el docente:", err);
            return res.status(500).send({ message: "Error al eliminar el docente" });
        }

        if (results.affectedRows === 0) {
            return res.status(404).send({ message: "Docente no encontrado" });
        }

        console.log("Docente eliminado exitosamente:", results);
        res.status(200).send({ message: 'Docente eliminado exitosamente' });
    });
});

app.post('/api/ingreso', (req, res) => {
    console.log("Datos recibidos:", req.body);

    const { rut_alumno, id_curso, estado, hora } = req.body;

    if (!rut_alumno || !id_curso || !estado || !hora) {
        console.log("Campos faltantes");
        return res.status(400).send({ message: "Todos los campos son obligatorios" });
    }

    const query = `
        INSERT INTO ingreso (rut_alumno, id_curso, estado, hora)
        VALUES (?, ?, ?, ?)
    `;

    connection.query(query, [rut_alumno, id_curso, estado, hora], (err, results) => {
        if (err) {
            console.error("Error al insertar en la tabla ingreso:", err);
            return res.status(500).send({ message: "Error al registrar la asistencia" });
        }
        console.log("Insert exitoso:", results);
        res.status(201).send({ message: "Asistencia registrada correctamente" });
    });
});


app.post('/api/salida', (req, res) => {
    const { rut_alumno, id_curso, estado, hora } = req.body;

    if (!rut_alumno || !id_curso || !estado || !hora) {
        return res.status(400).send({ message: "Todos los campos son obligatorios" });
    }

    const query = `
        INSERT INTO salida (rut_alumno, id_curso, estado, hora)
        VALUES (?, ?, ?, ?)
    `;

    connection.query(query, [rut_alumno, id_curso, estado, hora], (err, results) => {
        if (err) {
            console.error("Error al insertar en la tabla salida:", err);
            return res.status(500).send({ message: "Error al registrar la salida" });
        }
        res.status(201).send({ message: "Salida registrada correctamente" });
    });
});


app.post('/api/enviar-correo', async (req, res) => {
    console.log('REQUEST BODY: ', JSON.stringify(req.body, null, 2));
    const { email, asunto, mensaje } = req.body;
    try {
        const resultado = await sendMail(email, asunto, mensaje);
        res.json({ success: true, resultado });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Servidor corriendo`);
});

