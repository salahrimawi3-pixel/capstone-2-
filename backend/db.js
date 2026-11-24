import oracle from 'oracledb';

export async function connectOracle(env) {
  const pool = await oracle.createPool({
    user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING,
    poolMin: 1, poolMax: 6, queueTimeout: 5000,
  });
  return {
    async run(work) {
      const connection = await pool.getConnection();
      try {
        const execute = (sql, binds = {}) => connection.execute(sql, binds, {
          outFormat: oracle.OUT_FORMAT_OBJECT,
          fetchTypeHandler: (column) => column.dbType === oracle.DB_TYPE_CLOB
            ? { type: oracle.STRING } : undefined,
        });
        const result = await work({
          rows: async (sql, binds) => (await execute(sql, binds)).rows,
          execute,
          insert: async (sql, binds, column) => {
            const { outBinds } = await execute(sql + ' RETURNING ' + column + ' INTO :new_id', {
              ...binds, new_id: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
            });
            return outBinds.new_id[0];
          },
        });
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        await connection.close();
      }
    },
    close: () => pool.close(5),
  };
}
