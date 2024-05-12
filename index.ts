import jwt from 'jsonwebtoken'
import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import connection from './connection'
import { AddressInfo } from 'net'

const app = express()

app.use(express.json())
app.use(cors())

declare global {
  namespace Express {
    interface Request {
      user?: any
    }
  }
}

function authenticateToken (req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.sendStatus(401) // 401 Unauthorized se não houver token ou se o prefixo estiver ausente
  }
  jwt.verify(
    authHeader,
    process.env.JWT_SECRET as string,
    (err: any, user: any) => {
      if (err) {
        return res.sendStatus(403) // 403 Forbidden se o token for inválido ou expirado
      }
      req.user = user
      next()
    }
  )
}

// Rota POST para login e obtenção do token de autenticação
app.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body
  
  if (!username || !password ) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios!' });
  }

  try {
    // Verificar as credenciais do usuário no banco de dados
    const user = await connection('usuarios')
      .where({ username, password })
      .first()
    if (!user || !password) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }
    const token = jwt.sign({ username }, process.env.JWT_SECRET as string, {
      expiresIn: '1h'
    })
    // Retorna o token como resposta
    res.json({ token })
  } catch (error) {
    console.error('Erro ao fazer login:', error)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// Rota GET protegida por autenticação para retornar todas as partidas
app.get('/partidas', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Consulta ao banco de dados usando a conexão
    const partidas = await connection.select().from('partidas')
    res.json(partidas)
  } catch (error) {
    console.error('Erro ao obter partidas:', error)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})


// Rota POST protegida por autenticação para inserir novas partidas
app.post(
  '/partidas',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const partidas = Array.isArray(req.body) ? req.body : [req.body]
      if (partidas.length === 0) {
        return res.status(400).json({
          error:
            'O corpo da requisição deve conter pelo menos um objeto de partida'
        })
      }
      for (const partida of partidas) {
        if (
          !partida.data ||
          !partida.time_casa ||
          !partida.time_visitante ||
          !partida.placar_casa ||
          !partida.placar_visitante
        ) {
          return res
            .status(400)
            .json({ error: 'Todos os campos são obrigatórios!' })
        }
      }
      const insertedPartidas = await connection.transaction(async trx => {
        const insertedIds = await trx('partidas')
          .insert(partidas)
          .returning('id')
        return insertedIds
      })

      res.status(201).json({
        ids: insertedPartidas,
        message: 'Partida(s) inseridas com sucesso'
      })
    } catch (error) {
      console.error('Erro ao inserir partidas:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
)

app.put(
  '/partidas/:id',
  authenticateToken,
  async (req: Request, res: Response) => {
    const id = req.params.id
    const { data, time_casa, time_visitante, placar_casa, placar_visitante } =
      req.body
    // Verifica se todos os campos obrigatórios estão preenchidos
    if (
      !data ||
      !time_casa ||
      !time_visitante ||
      !placar_casa ||
      !placar_visitante
    ) {
      return res
        .status(400)
        .json({ error: 'Todos os campos são obrigatórios!' })
    }

    try {
      await connection.transaction(async trx => {
        const partidaExistente = await trx('partidas').where('id', id).first()
        if (!partidaExistente) {
          return res.status(404).json({ error: 'Partida não encontrada' })
        }
        await trx('partidas').where('id', id).update({
          data,
          time_casa,
          time_visitante,
          placar_casa,
          placar_visitante
        })
        res.status(200).json({ message: 'Partida atualizada com sucesso' })
      })
    } catch (error) {
      console.error('Erro ao atualizar partida:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
)

app.delete(
  '/partidas/:id',
  authenticateToken,
  async (req: Request, res: Response) => {
    const id = req.params.id
    try {
      await connection.transaction(async trx => {
        const partidaExistente = await trx('partidas').where('id', id).first()
        if (!partidaExistente) {
          return res.status(404).json({ error: 'Partida não encontrada' })
        }
        await trx('partidas').where('id', id).delete()
        res.status(200).json({ message: 'Partida excluída com sucesso' })
      })
    } catch (error) {
      console.error('Erro ao excluir partida:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
)


app.get('/jogadores', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Consulta ao banco de dados usando a conexão
    const jogadores = await connection.select().from('jogadores')
    res.json(jogadores)
  } catch (error) {
    console.error('Erro ao obter jogadores:', error)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

app.post(
  '/jogadores',
  authenticateToken,
  async (req: Request, res: Response) => {
    const { nome, idade, posicao, time_q_joga } = req.body
    if (!nome || !idade || !posicao || !time_q_joga) {
      return res.status(400).json('Todos os campos são obrigatórios!')
    }
    try {
      await connection.transaction(async trx => {
        const ids = await trx('jogadores')
          .insert({ nome, idade, posicao, time_q_joga })
          .returning('id')
        res
          .status(201)
          .json({ ids, message: 'Jogadore(s) inseridos com sucesso' })
      })
    } catch (error) {
      console.error('Erro ao inserir jogadore(s):', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
)


app.put(
  '/jogadores/:nome',
  authenticateToken,
  async (req: Request, res: Response) => {
    const nome: string = req.params.nome; // Assegure que o tipo é uma string
    const { novoNome, idade, posicao, time_q_joga } = req.body;
    if (!novoNome || !idade || !posicao || !time_q_joga) {
      return res.status(400).json('Todos os campos são obrigatórios!');
    }
    try {
      await connection.transaction(async trx => {
        const jogadorExistente = await trx('jogadores').where('nome', nome).first();
        if (!jogadorExistente) {
          return res.status(404).json({ error: 'Jogador não encontrado' });
        }
        // Atualize cada coluna explicitamente
        await trx('jogadores')
          .where('nome', nome)
          .update({ nome: novoNome, idade: idade, posicao: posicao, time_q_joga: time_q_joga });
        res.status(200).json({ message: 'Jogador atualizado com sucesso' });
      });
    } catch (error) {
      console.error('Erro ao atualizar jogador:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
);


app.delete(
  '/jogadores/:nome',
  authenticateToken,
  async (req: Request, res: Response) => {
    const nome = req.params.nome
    try {
      await connection.transaction(async trx => {
        const jogadorExistente = await trx('jogadores').where('nome', nome).first()
        if (!jogadorExistente) {
          return res.status(404).json({ error: 'Jogador não encontrado' })
        }
        await trx('jogadores').where('nome', nome).delete()
        res.status(200).json({ message: 'Jogador excluído com sucesso' })
      })
    } catch (error) {
      console.error('Erro ao excluir jogador:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
)

app.get('/times', authenticateToken, async (req: Request, res: Response) => {
  try{
  const times = await connection.select().from('times')
  res.json(times)
  } catch (e) {
    console.error('Erro ao buscar times', e)
    res.status(500).json('Erro interno do servidor')
  }
})

app.post('/times', authenticateToken, async (req: Request, res: Response) => {
  const { nome, logo_url } = req.body
  if(!nome || !logo_url){
    res.status(400).json('Todos os campos devem ser preenchidos!')
  }
  try {
    await connection.transaction(async trx => {
      const ids = await trx('times').insert({ nome, logo_url }).returning('id')
      res.status(201).json({ ids, message: 'Time(s) inseridos com sucesso' })
    })
  } catch (error) {
    console.error('Erro ao inserir time(s):', error)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})


app.put(
  '/times/:nome',
  authenticateToken,
  async (req: Request, res: Response) => {
    const { nome } = req.params; 
    const { logo_url } = req.body; 
    
    if(!logo_url){
      return res.status(400).json('A URL do logo deve ser preenchida');
    }
    
    try {
      await connection.transaction(async (trx) => {
        
        const timeExistente = await trx('times').where('nome', nome).first();
        if (!timeExistente) {
          return res.status(404).json({ error: 'Time não encontrado' });
        }

  
        await trx('times').where('nome', nome).update({ logo_url });

        res.status(200).json({ message: 'URL do logo do time atualizada com sucesso' });
      });
    } catch (error) {
      console.error('Erro ao atualizar URL do logo do time:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
);




app.delete(
  '/times/:nome',
  authenticateToken,
  async (req: Request, res: Response) => {
    const nome = req.params.nome
    try {
      await connection.transaction(async trx => {
        const timeExistente = await trx('times').where('nome', nome).first()
        if (!timeExistente) {
          return res.status(404).json({ error: 'Time não encontrado' })
        }
        await trx('times').where('nome', nome).delete()
        res.status(200).json({ message: 'Time excluído com sucesso' })
      })
    } catch (error) {
      console.error('Erro ao excluir time:', error)
      res.status(500).json({ error: 'Erro interno do servidor' })
    }
  }
)



const server = app.listen(process.env.PORT || 3000, () => {
  if (server) {
    const address = server.address() as AddressInfo
    console.log(`Server is running in http://localhost:${address.port}`)
  } else {
    console.error(`Failure upon starting server.`)
  }
})
